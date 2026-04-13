/**
 * PYMETRIC ARCADE — Game 5: Lengths Game
 *
 * Measures: Quantitative Reasoning, Attention to Detail
 * Secondary: Processing Speed
 *
 * 20 questions. Two bars displayed — click the longer one.
 * Differences range from obvious to very subtle (1px difference).
 */

window.LengthsGame = (function () {
  'use strict';

  const TOTAL_QUESTIONS = 20;
  const MIN_WIDTH = 40;   // px (% of arena)
  const MAX_WIDTH = 95;   // px (%)
  const SHOW_FEEDBACK_MS = 500;

  // Difficulty levels: difference in % width
  const LEVELS = [
    { diff: 40, count: 4 }, // Very easy
    { diff: 20, count: 4 }, // Easy
    { diff: 10, count: 4 }, // Medium
    { diff:  5, count: 4 }, // Hard
    { diff:  2, count: 4 }  // Very hard
  ];

  let questions = [];
  let currentQ = 0;
  let correctCount = 0;
  let responseTimes = [];
  let qStartTime = 0;
  let gameActive = false;
  let answered = false;

  function buildQuestions() {
    const qs = [];
    for (const level of LEVELS) {
      for (let i = 0; i < level.count; i++) {
        const base = MIN_WIDTH + Math.random() * (MAX_WIDTH - MIN_WIDTH - level.diff);
        const longer = base + level.diff;
        const shorter = base;
        // Randomise which bar is on top
        const topIsLonger = Math.random() < 0.5;
        qs.push({
          topWidth:    topIsLonger ? longer : shorter,
          bottomWidth: topIsLonger ? shorter : longer,
          correctIndex: topIsLonger ? 0 : 1,  // 0=top bar, 1=bottom bar
          difficulty: level.diff
        });
      }
    }
    // Shuffle
    for (let i = qs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [qs[i], qs[j]] = [qs[j], qs[i]];
    }
    return qs;
  }

  function init() {
    questions  = buildQuestions();
    currentQ   = 0;
    correctCount = 0;
    responseTimes = [];
    gameActive = true;
    answered   = false;
    renderQuestion();
    updateHUD();
  }

  function renderQuestion() {
    if (currentQ >= TOTAL_QUESTIONS) { finishGame(); return; }

    const q = questions[currentQ];
    answered = false;
    qStartTime = Date.now();

    const arena = document.getElementById('len-arena');
    if (!arena) return;

    arena.innerHTML = '';

    // Line PNG assets for bar textures
    const LINE_ASSETS = [
      'assets/games/lengths/line-a.png',
      'assets/games/lengths/line-b.png',
      'assets/games/lengths/line-c.png',
      'assets/games/lengths/line-d.png'
    ];

    [q.topWidth, q.bottomWidth].forEach((widthPct, idx) => {
      const wrap = document.createElement('div');
      wrap.className = 'length-bar-wrap';
      wrap.onclick = () => answer(idx);

      const label = document.createElement('div');
      label.className = 'length-bar-label';
      label.textContent = idx === 0 ? 'A' : 'B';

      const bar = document.createElement('div');
      bar.className = 'length-bar';
      bar.style.width = `${widthPct}%`;
      bar.style.maxWidth = '100%';
      // Apply PNG line texture
      const lineAsset = LINE_ASSETS[idx % LINE_ASSETS.length];
      bar.style.backgroundImage = `url('${lineAsset}')`;
      bar.style.backgroundSize = '100% 100%';
      bar.style.backgroundRepeat = 'no-repeat';
      bar.style.imageRendering = 'pixelated';

      wrap.appendChild(label);
      wrap.appendChild(bar);
      arena.appendChild(wrap);
    });

    setFeedback('');
    updateHUD();
  }

  function answer(chosenIdx) {
    if (!gameActive || answered) return;
    answered = true;

    const rt = Date.now() - qStartTime;
    responseTimes.push(rt);

    const q = questions[currentQ];
    const correct = chosenIdx === q.correctIndex;
    if (correct) { correctCount++; window.PymetricSounds && window.PymetricSounds.sfxCorrect(); }
    else { window.PymetricSounds && window.PymetricSounds.sfxWrong(); }

    // Visual feedback on bars using answer PNG assets
    const arena = document.getElementById('len-arena');
    const wraps = arena ? arena.querySelectorAll('.length-bar-wrap') : [];
    wraps.forEach((w, i) => {
      const bar = w.querySelector('.length-bar');
      if (i === q.correctIndex) {
        if (bar) {
          bar.style.backgroundImage = "url('assets/ui/answer-correct.png')";
          bar.style.backgroundSize = 'cover';
          bar.style.backgroundColor = 'var(--gba-green)';
        }
      } else {
        if (bar) {
          bar.style.backgroundImage = "url('assets/ui/answer-wrong-selected.png')";
          bar.style.backgroundSize = 'cover';
          bar.style.backgroundColor = 'var(--gba-red)';
        }
      }
      w.style.pointerEvents = 'none';
    });

    setFeedback(
      correct
        ? `✓ CORRECT! (${rt}ms)`
        : `✗ WRONG — ${chosenIdx === 0 ? 'B' : 'A'} was longer (${rt}ms)`,
      correct
        ? 'color:var(--gba-green)'
        : 'color:var(--gba-red)'
    );

    updateHUD();

    setTimeout(() => {
      currentQ++;
      renderQuestion();
    }, SHOW_FEEDBACK_MS);
  }

  function updateHUD() {
    const qNumEl   = document.getElementById('len-qnum');
    const corrEl   = document.getElementById('len-correct');
    const avgEl    = document.getElementById('len-avgtime');

    if (qNumEl)  qNumEl.textContent  = `${Math.min(currentQ + 1, TOTAL_QUESTIONS)} / ${TOTAL_QUESTIONS}`;
    if (corrEl)  corrEl.textContent  = correctCount;

    if (responseTimes.length > 0 && avgEl) {
      const avg = responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length;
      avgEl.textContent = `${Math.round(avg)}ms`;
    } else if (avgEl) {
      avgEl.textContent = '—';
    }
  }

  function setFeedback(msg, style) {
    const el = document.getElementById('len-feedback');
    if (!el) return;
    el.textContent = msg;
    el.style.cssText = style || '';
  }

  function finishGame() {
    gameActive = false;
    if (window.PymetricApp) window.PymetricApp.gameFinished(5, getResults());
  }

  /* ── Scoring ── */
  function getResults() {
    const accuracy = correctCount / TOTAL_QUESTIONS;
    const avgRT    = responseTimes.length
      ? responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length
      : 0;

    // Consistency: std dev of RTs
    const rtVariance = responseTimes.reduce((s, v) => s + (v - avgRT) ** 2, 0) / (responseTimes.length || 1);
    const rtStdDev   = Math.sqrt(rtVariance);
    const rtCv       = avgRT > 0 ? rtStdDev / avgRT : 1; // coefficient of variation
    const consistencyScore = Math.max(0, Math.round((1 - rtCv) * 100));

    // Combined score: 70% accuracy + 30% speed (faster is better, benchmark 800ms)
    const speedScore = Math.max(0, Math.round((1 - Math.min(avgRT / 2000, 1)) * 100));
    const totalScore = Math.round(accuracy * 70 + speedScore * 0.30);

    let category;
    if      (accuracy >= 0.9 && avgRT < 700)  category = 'EXCELLENT';
    else if (accuracy >= 0.8 && avgRT < 1000) category = 'GOOD';
    else if (accuracy >= 0.7)                  category = 'AVERAGE';
    else if (accuracy >= 0.6)                  category = 'BELOW AVERAGE';
    else                                        category = 'LOW';

    // Per-difficulty analysis
    const diffAnalysis = LEVELS.map(level => {
      const levelQs = questions.filter(q => q.difficulty === level.diff);
      const correct  = levelQs.filter((q, i) => {
        const globalIdx = questions.indexOf(q);
        return globalIdx < responseTimes.length;
      });
      return { difficulty: level.diff, total: levelQs.length };
    });

    return {
      game: 'LENGTHS',
      gameName: 'Lengths Game',
      totalQuestions: TOTAL_QUESTIONS,
      correctCount,
      accuracy: Math.round(accuracy * 100) / 100,
      accuracyPct: `${Math.round(accuracy * 100)}%`,
      avgResponseMs: Math.round(avgRT),
      rtStdDevMs: Math.round(rtStdDev),
      consistencyScore,
      speedScore,
      totalScore,
      category,
      responseTimes,
      primary: {
        label: 'Quantitative Accuracy + Speed',
        value: `${Math.round(accuracy * 100)}% correct, avg ${Math.round(avgRT)}ms — ${category}`,
        raw: totalScore
      },
      secondary: {
        accuracyPct: `${Math.round(accuracy * 100)}%`,
        avgResponseMs: Math.round(avgRT),
        consistencyScore,
        speedScore
      }
    };
  }

  return { init, getResults };
})();
