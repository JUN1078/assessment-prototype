/**
 * PYMETRIC ARCADE — Sound Engine
 * Web Audio API: Chiptune BGM loop + SFX (zero audio files needed)
 */
window.PymetricSounds = (function () {
  'use strict';

  let ctx = null;
  let bgmGain = null;
  let sfxGain = null;
  let bgmRunning = false;
  let muted = false;
  let schedTimer = null;

  // Melody / bass note position tracking
  let melodyIdx = 0;
  let bassIdx = 0;
  let melodyTime = 0;
  let bassTime = 0;

  const BPM = 152;
  const S16 = (60 / BPM) / 4; // duration of one 16th note in seconds

  // Arcade chiptune melody  [freq_hz, duration_in_16ths]  (0 = rest)
  const MELODY = [
    [523,1],[659,1],[784,1],[523,1],  [659,2],[784,2],
    [880,1],[784,1],[659,1],[523,1],  [659,2],[523,2],
    [587,1],[698,1],[880,1],[587,1],  [698,2],[880,2],
    [784,1],[659,1],[523,1],[392,1],  [440,2],[523,2],
    [523,1],[659,1],[784,1],[1047,1], [880,2],[784,2],
    [659,1],[523,1],[659,1],[784,1],  [880,4],
    [784,1],[659,1],[523,1],[440,1],  [392,2],[440,2],
    [523,4],[0,4],
    [659,1],[784,1],[880,1],[1047,1], [880,2],[784,2],
    [659,2],[784,2],                  [880,4],
    [784,1],[659,1],[784,1],[880,1],  [1047,4],
    [880,1],[784,1],[659,1],[523,1],  [392,4],
    [440,2],[523,2],[659,2],[784,2],  [523,4],[0,4],
  ];

  // Bass line [freq_hz, duration_in_16ths]
  const BASS = [
    [131,4],[196,4], [131,4],[165,4],
    [147,4],[220,4], [98,4],[0,4],
    [131,4],[196,4], [131,4],[196,4],
    [131,4],[165,4], [98,4],[0,4],
    [131,4],[196,4], [131,4],[196,4],
    [131,4],[165,4], [131,4],[196,4],
    [147,4],[220,4], [147,4],[196,4],
    [131,4],[0,4],   [98,4],[0,4],
  ];

  /* ── Audio context bootstrap ── */
  function ensureCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      bgmGain = ctx.createGain();
      bgmGain.gain.value = 0.10;
      bgmGain.connect(ctx.destination);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.35;
      sfxGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /* ── Oscillator helper ── */
  function playOsc(freq, dur, type, gainNode, startAt, vol) {
    if (!freq || !ctx) return;
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.4, startAt);
    g.gain.exponentialRampToValueAtTime(0.001, startAt + dur);
    osc.connect(g);
    g.connect(gainNode);
    osc.start(startAt);
    osc.stop(startAt + dur + 0.01);
  }

  /* ── BGM lookahead scheduler ── */
  function schedulerTick() {
    if (!bgmRunning || muted || !ctx) return;
    const horizon = ctx.currentTime + 0.3;

    while (melodyTime < horizon) {
      const [f, b] = MELODY[melodyIdx % MELODY.length];
      const d = b * S16;
      if (f) playOsc(f, d * 0.72, 'square', bgmGain, melodyTime, 0.32);
      melodyTime += d;
      melodyIdx++;
    }

    while (bassTime < horizon) {
      const [f, b] = BASS[bassIdx % BASS.length];
      const d = b * S16;
      if (f) playOsc(f, d * 0.55, 'triangle', bgmGain, bassTime, 0.16);
      bassTime += d;
      bassIdx++;
    }

    schedTimer = setTimeout(schedulerTick, 100);
  }

  function startBGM() {
    if (bgmRunning) return;
    ensureCtx();
    bgmRunning = true;
    melodyIdx  = 0; bassIdx = 0;
    melodyTime = ctx.currentTime + 0.15;
    bassTime   = ctx.currentTime + 0.15;
    schedulerTick();
  }

  function stopBGM() {
    bgmRunning = false;
    if (schedTimer) { clearTimeout(schedTimer); schedTimer = null; }
  }

  function toggleMute() {
    muted = !muted;
    if (!ctx) ensureCtx();
    if (bgmGain) bgmGain.gain.value = muted ? 0 : 0.10;
    if (sfxGain) sfxGain.gain.value = muted ? 0 : 0.35;
    if (!muted && !bgmRunning) startBGM();
    return muted;
  }

  /* ══════════════════ SFX ══════════════════ */

  function sfxClick() {
    if (muted) return;
    ensureCtx();
    const t = ctx.currentTime;
    playOsc(880, 0.04, 'square', sfxGain, t,      0.28);
    playOsc(660, 0.04, 'square', sfxGain, t+0.04, 0.20);
  }

  function sfxSelect() {
    if (muted) return;
    ensureCtx();
    playOsc(523, 0.05, 'square', sfxGain, ctx.currentTime, 0.18);
  }

  function sfxCorrect() {
    if (muted) return;
    ensureCtx();
    const t = ctx.currentTime;
    [[523,0.07],[659,0.07],[784,0.14]].forEach(([f,d],i) =>
      playOsc(f, d, 'square', sfxGain, t + i*0.07, 0.30)
    );
  }

  function sfxWrong() {
    if (muted) return;
    ensureCtx();
    const t = ctx.currentTime;
    playOsc(260, 0.11, 'sawtooth', sfxGain, t,      0.30);
    playOsc(185, 0.15, 'sawtooth', sfxGain, t+0.11, 0.27);
  }

  function sfxStart() {
    if (muted) return;
    ensureCtx();
    const t = ctx.currentTime;
    [[262,0.08],[330,0.08],[392,0.08],[523,0.08],[784,0.20]]
      .forEach(([f,d],i) => playOsc(f, d, 'square', sfxGain, t + i*0.08, 0.28));
  }

  function sfxComplete() {
    if (muted) return;
    ensureCtx();
    const t = ctx.currentTime;
    [[523,0.09],[659,0.09],[784,0.09],[1047,0.20]]
      .forEach(([f,d],i) => playOsc(f, d, 'square', sfxGain, t + i*0.09, 0.28));
  }

  function sfxVictory() {
    if (muted) return;
    ensureCtx();
    const t = ctx.currentTime;
    [523,659,784,523,659,784,1047,784,1047,1319]
      .forEach((f,i) => playOsc(f, 0.10, 'square', sfxGain, t + i*0.10, 0.28));
  }

  function sfxPump() {
    if (muted) return;
    ensureCtx();
    const t   = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(155, t);
    osc.frequency.linearRampToValueAtTime(370, t + 0.09);
    g.gain.setValueAtTime(0.20, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(g); g.connect(sfxGain);
    osc.start(t); osc.stop(t + 0.15);
  }

  function sfxPop() {
    if (muted) return;
    ensureCtx();
    // Noise burst via AudioBuffer
    const len = Math.floor(ctx.sampleRate * 0.22);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    const k   = ctx.sampleRate * 0.032;
    for (let i = 0; i < len; i++) d[i] = (Math.random()*2-1) * Math.exp(-i/k);
    const src = ctx.createBufferSource();
    const g   = ctx.createGain();
    src.buffer = buf;
    g.gain.value = 0.55;
    src.connect(g); g.connect(sfxGain);
    src.start(ctx.currentTime);
  }

  function sfxSave() {
    if (muted) return;
    ensureCtx();
    const t = ctx.currentTime;
    [[659,0.07],[784,0.07],[1047,0.14]]
      .forEach(([f,d],i) => playOsc(f, d, 'square', sfxGain, t + i*0.07, 0.26));
  }

  function sfxMove() {
    if (muted) return;
    ensureCtx();
    playOsc(440, 0.05, 'triangle', sfxGain, ctx.currentTime, 0.20);
  }

  function sfxWarning() {
    if (muted) return;
    ensureCtx();
    const t = ctx.currentTime;
    playOsc(880, 0.08, 'sawtooth', sfxGain, t,      0.26);
    playOsc(880, 0.08, 'sawtooth', sfxGain, t+0.16, 0.26);
  }

  return {
    startBGM, stopBGM, toggleMute, isMuted: () => muted,
    sfxClick, sfxSelect, sfxCorrect, sfxWrong,
    sfxStart, sfxComplete, sfxVictory,
    sfxPump, sfxPop, sfxSave, sfxMove, sfxWarning
  };
})();
