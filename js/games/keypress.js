/**
 * PYMETRIC ARCADE — Game 3: Keypress Game
 *
 * Measures: Motor Speed, Effort, Motivation
 * Task: Press SPACEBAR as many times as possible in 30 seconds.
 *
 * Rules:
 * - Press count NOT shown in real-time (only time remaining)
 * - Presses per time-window recorded for consistency analysis
 */

window.KeypressGame = (function () {
  'use strict';

  const DURATION = 30; // seconds
  const WINDOW_SIZE = 5; // seconds per analysis window

  let totalPresses = 0;
  let timerInterval = null;
  let timeLeft = DURATION;
  let gameActive = false;
  let startTime = 0;
  let pressTimestamps = []; // ms timestamps of each press
  let windowCounts = [];    // presses per 5-sec window

  function init() {
    totalPresses = 0;
    timeLeft = DURATION;
    gameActive = false;
    startTime = 0;
    pressTimestamps = [];
    windowCounts = [];

    updateTimerDisplay();
    const countEl = document.getElementById('kp-count-display');
    if (countEl) countEl.textContent = '—';
    setFeedback('PRESS SPACEBAR TO BEGIN', 'color:var(--color-pixel-lightGray)');

    // Keyboard listener
    document.addEventListener('keydown', handleKey);
    // Click listener for touch/mouse
    const area = document.getElementById('kp-area');
    if (area) area.addEventListener('mousedown', handleClick);
  }

  function handleKey(e) {
    if (!gameActive && e.code === 'Space') {
      e.preventDefault();
      startGame();
    } else if (gameActive && e.code === 'Space') {
      e.preventDefault();
      registerPress();
    }
  }

  function handleClick(e) {
    e.preventDefault();
    if (!gameActive) {
      startGame();
    } else {
      registerPress();
    }
  }

  function startGame() {
    gameActive = true;
    startTime = Date.now();
    timeLeft = DURATION;
    registerPress();

    timerInterval = setInterval(tick, 1000);
    setFeedback('KEEP PRESSING!', 'color:var(--color-pixel-green)');
  }

  function tick() {
    timeLeft--;
    updateTimerDisplay();

    // Record window count every WINDOW_SIZE seconds
    if (timeLeft % WINDOW_SIZE === 0 || timeLeft === 0) {
      const windowIdx = Math.floor((DURATION - timeLeft) / WINDOW_SIZE) - 1;
      const elapsed   = (DURATION - timeLeft) * 1000;
      const windowStart = elapsed - WINDOW_SIZE * 1000;
      const wCount = pressTimestamps.filter(
        t => (t - startTime) >= windowStart && (t - startTime) < elapsed
      ).length;
      windowCounts.push(wCount);
    }

    if (timeLeft <= 5) {
      const timerEl = document.getElementById('kp-timer');
      if (timerEl) timerEl.className = 'timer-display critical';
    }

    if (timeLeft <= 0) {
      endGame();
    }
  }

  function registerPress() {
    if (!gameActive) return;
    totalPresses++;
    pressTimestamps.push(Date.now());

    // Visual feedback
    const area = document.getElementById('kp-area');
    if (area) {
      area.classList.add('pressed');
      clearTimeout(area._pt);
      area._pt = setTimeout(() => area.classList.remove('pressed'), 80);
    }
  }

  function updateTimerDisplay() {
    const el = document.getElementById('kp-timer');
    if (el) el.textContent = timeLeft;
  }

  function setFeedback(msg, style) {
    const el = document.getElementById('kp-feedback');
    if (!el) return;
    el.innerHTML = msg;
    el.style.cssText = style || '';
  }

  function endGame() {
    clearInterval(timerInterval);
    gameActive = false;

    document.removeEventListener('keydown', handleKey);
    const area = document.getElementById('kp-area');
    if (area) area.removeEventListener('mousedown', handleClick);

    const countEl = document.getElementById('kp-count-display');
    if (countEl) countEl.textContent = totalPresses;

    setFeedback(
      `DONE! ${totalPresses} PRESSES — ${(totalPresses / DURATION).toFixed(1)}/sec`,
      'color:var(--color-pixel-yellow);font-size:13px;'
    );

    if (window.PymetricApp) window.PymetricApp.gameFinished(3, getResults());
  }

  /* ── Scoring ── */
  function getResults() {
    const pressesPerSec = totalPresses / DURATION;

    // Consistency: std dev of window counts
    const avg = windowCounts.reduce((s, v) => s + v, 0) / (windowCounts.length || 1);
    const variance = windowCounts.reduce((s, v) => s + (v - avg) ** 2, 0) / (windowCounts.length || 1);
    const stdDev = Math.sqrt(variance);
    const consistencyScore = Math.max(0, Math.round(100 - (stdDev / (avg || 1)) * 100));

    // Effort score: based on presses per second (benchmark: ~6-8/sec = high effort)
    let effortScore;
    if      (pressesPerSec >= 8) effortScore = 100;
    else if (pressesPerSec >= 6) effortScore = 85;
    else if (pressesPerSec >= 4) effortScore = 70;
    else if (pressesPerSec >= 2) effortScore = 50;
    else                          effortScore = 30;

    return {
      game: 'KEYPRESS',
      gameName: 'Keypress Game',
      totalPresses,
      pressesPerSec: Math.round(pressesPerSec * 10) / 10,
      durationSeconds: DURATION,
      windowCounts,
      consistencyScore,
      effortScore,
      primary: {
        label: 'Motor Speed (presses/sec)',
        value: `${pressesPerSec.toFixed(1)}/sec — ${totalPresses} total`,
        raw: pressesPerSec
      },
      secondary: {
        totalPresses,
        pressesPerSec: Math.round(pressesPerSec * 10) / 10,
        consistencyScore,
        windowBreakdown: windowCounts
      }
    };
  }

  function cleanup() {
    clearInterval(timerInterval);
    document.removeEventListener('keydown', handleKey);
    const area = document.getElementById('kp-area');
    if (area) area.removeEventListener('mousedown', handleClick);
  }

  return { init, getResults, cleanup };
})();
