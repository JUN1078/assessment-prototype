/**
 * PYMETRIC ARCADE — Game 6: Faces Game
 *
 * Measures: Emotion Recognition, Emotional Intelligence, Empathy
 *
 * 16 questions (8 basic emotions × 2 for consistency).
 * Shows emoji face, player identifies the emotion.
 * Intensity varies from clear to ambiguous.
 */

window.FacesGame = (function () {
  'use strict';

  const TOTAL_QUESTIONS = 16;
  const SHOW_FEEDBACK_MS = 600;

  // Emotion definitions: emoji, correct label, distractors
  const EMOTIONS = [
    {
      label: 'HAPPY',
      faces: ['😄', '😊', '🙂'],
      choices: ['HAPPY', 'SURPRISED', 'EXCITED', 'NEUTRAL'],
      correct: 'HAPPY',
      valence: 'positive'
    },
    {
      label: 'SAD',
      faces: ['😢', '😞', '☹️'],
      choices: ['SAD', 'DISGUST', 'FEAR', 'NEUTRAL'],
      correct: 'SAD',
      valence: 'negative'
    },
    {
      label: 'ANGRY',
      faces: ['😠', '😡', '😤'],
      choices: ['ANGRY', 'DISGUST', 'CONTEMPT', 'SAD'],
      correct: 'ANGRY',
      valence: 'negative'
    },
    {
      label: 'FEAR',
      faces: ['😨', '😰', '😱'],
      choices: ['FEAR', 'SURPRISED', 'SAD', 'DISGUST'],
      correct: 'FEAR',
      valence: 'negative'
    },
    {
      label: 'SURPRISED',
      faces: ['😲', '😮', '🤩'],
      choices: ['SURPRISED', 'HAPPY', 'FEAR', 'EXCITED'],
      correct: 'SURPRISED',
      valence: 'neutral'
    },
    {
      label: 'DISGUST',
      faces: ['🤢', '😒', '😑'],
      choices: ['DISGUST', 'ANGRY', 'CONTEMPT', 'NEUTRAL'],
      correct: 'DISGUST',
      valence: 'negative'
    },
    {
      label: 'CONTEMPT',
      faces: ['😏', '🙄', '😒'],
      choices: ['CONTEMPT', 'ANGRY', 'DISGUST', 'NEUTRAL'],
      correct: 'CONTEMPT',
      valence: 'negative'
    },
    {
      label: 'NEUTRAL',
      faces: ['😐', '😶', '🫤'],
      choices: ['NEUTRAL', 'HAPPY', 'SAD', 'TIRED'],
      correct: 'NEUTRAL',
      valence: 'neutral'
    }
  ];

  // Additional ambiguous emotions (for harder questions)
  const AMBIGUOUS = [
    {
      label: 'PAIN',
      faces: ['😣', '😖', '🤕'],
      choices: ['PAIN', 'ANGRY', 'DISGUST', 'FEAR'],
      correct: 'PAIN',
      valence: 'negative'
    },
    {
      label: 'HOPE',
      faces: ['🥺', '🤞', '😔'],
      choices: ['HOPE', 'SAD', 'FEAR', 'NEUTRAL'],
      correct: 'HOPE',
      valence: 'positive'
    }
  ];

  let questions = [];
  let currentQ  = 0;
  let correctCount = 0;
  let responseTimes = [];
  let qStartTime  = 0;
  let gameActive  = false;
  let answered    = false;
  let responseLog = []; // {emotionLabel, chosen, correct, rtMs, valence}

  function buildQuestions() {
    const pool = [];
    // Each of 8 basic emotions shown twice (different intensity face)
    EMOTIONS.forEach(em => {
      const face1 = em.faces[0];
      const face2 = em.faces[Math.min(1, em.faces.length - 1)];
      pool.push({ ...em, face: face1, intensity: 'clear' });
      pool.push({ ...em, face: face2, intensity: 'medium' });
    });

    // Shuffle and take 16
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, TOTAL_QUESTIONS);
  }

  function init() {
    questions    = buildQuestions();
    currentQ     = 0;
    correctCount = 0;
    responseTimes = [];
    responseLog   = [];
    gameActive    = true;
    answered      = false;
    renderQuestion();
    updateHUD();
  }

  function renderQuestion() {
    if (currentQ >= TOTAL_QUESTIONS) { finishGame(); return; }

    const q = questions[currentQ];
    answered  = false;
    qStartTime = Date.now();

    // Show face
    const stimulus = document.getElementById('face-stimulus');
    if (stimulus) {
      stimulus.textContent = q.face;
      stimulus.className   = 'face-display anim-pop';
      setTimeout(() => stimulus.classList.remove('anim-pop'), 400);
    }

    // Render choice buttons
    const choicesEl = document.getElementById('face-choices');
    if (!choicesEl) return;
    choicesEl.innerHTML = '';

    // Shuffle choices
    const shuffled = [...q.choices].sort(() => Math.random() - 0.5);
    shuffled.forEach(choice => {
      const btn = document.createElement('div');
      btn.className = 'emotion-btn';
      btn.textContent = choice;
      btn.onclick = () => answer(choice, q);
      choicesEl.appendChild(btn);
    });

    setFeedback('');
    updateHUD();
  }

  function answer(chosen, q) {
    if (!gameActive || answered) return;
    answered = true;

    const rt = Date.now() - qStartTime;
    responseTimes.push(rt);

    const correct = chosen === q.correct;
    if (correct) { correctCount++; window.PymetricSounds && window.PymetricSounds.sfxCorrect(); }
    else { window.PymetricSounds && window.PymetricSounds.sfxWrong(); }

    responseLog.push({
      questionIdx:  currentQ,
      emotionLabel: q.label,
      shown:        q.face,
      intensity:    q.intensity,
      chosen,
      correct,
      rtMs:         rt,
      valence:      q.valence
    });

    // Highlight choices
    const btns = document.querySelectorAll('.emotion-btn');
    btns.forEach(btn => {
      btn.style.pointerEvents = 'none';
      if (btn.textContent === q.correct) {
        btn.style.background     = 'rgba(46,204,113,0.3)';
        btn.style.borderColor    = 'var(--color-pixel-green)';
        btn.style.color          = 'var(--color-pixel-green)';
      } else if (btn.textContent === chosen && !correct) {
        btn.style.background  = 'rgba(255,71,87,0.3)';
        btn.style.borderColor = 'var(--color-pixel-red)';
        btn.style.color       = 'var(--color-pixel-red)';
      }
    });

    setFeedback(
      correct
        ? `✓ CORRECT! (${rt}ms)`
        : `✗ WRONG — It was ${q.correct} (${rt}ms)`,
      correct
        ? 'color:var(--color-pixel-green)'
        : 'color:var(--color-pixel-red)'
    );

    updateHUD();

    setTimeout(() => {
      currentQ++;
      renderQuestion();
    }, SHOW_FEEDBACK_MS);
  }

  function updateHUD() {
    const qNumEl   = document.getElementById('face-qnum');
    const corrEl   = document.getElementById('face-correct');
    const avgEl    = document.getElementById('face-avgtime');

    if (qNumEl) qNumEl.textContent = `${Math.min(currentQ + 1, TOTAL_QUESTIONS)} / ${TOTAL_QUESTIONS}`;
    if (corrEl) corrEl.textContent = correctCount;
    if (responseTimes.length > 0 && avgEl) {
      const avg = responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length;
      avgEl.textContent = `${Math.round(avg)}ms`;
    }
  }

  function setFeedback(msg, style) {
    const el = document.getElementById('face-feedback');
    if (!el) return;
    el.textContent = msg;
    el.style.cssText = style || '';
  }

  function finishGame() {
    gameActive = false;
    if (window.PymetricApp) window.PymetricApp.gameFinished(6, getResults());
  }

  /* ── Scoring ── */
  function getResults() {
    const accuracy = correctCount / TOTAL_QUESTIONS;
    const avgRT    = responseTimes.length
      ? responseTimes.reduce((s, v) => s + v, 0) / responseTimes.length
      : 0;

    const correctRTs   = responseLog.filter(r => r.correct).map(r => r.rtMs);
    const incorrectRTs = responseLog.filter(r => !r.correct).map(r => r.rtMs);
    const avgCorrectRT   = correctRTs.length   ? correctRTs.reduce((s, v)   => s + v, 0) / correctRTs.length   : 0;
    const avgIncorrectRT = incorrectRTs.length ? incorrectRTs.reduce((s, v) => s + v, 0) / incorrectRTs.length : 0;

    // Error pattern: did errors cluster in same valence?
    const errors = responseLog.filter(r => !r.correct);
    const negErrors = errors.filter(r => r.valence === 'negative').length;
    const posErrors = errors.filter(r => r.valence === 'positive').length;

    // Consistency: second showing vs first showing accuracy
    const firstShowings  = responseLog.filter((r, i) => i % 2 === 0);
    const secondShowings = responseLog.filter((r, i) => i % 2 === 1);
    const consistencyFirst  = firstShowings.filter(r => r.correct).length / (firstShowings.length || 1);
    const consistencySecond = secondShowings.filter(r => r.correct).length / (secondShowings.length || 1);

    // EQ Score: accuracy-weighted (70%) + speed (15%) + consistency (15%)
    const speedScore = Math.max(0, Math.round((1 - Math.min(avgRT / 3000, 1)) * 100));
    const consScore  = Math.round(Math.abs(consistencyFirst - consistencySecond) < 0.2 ? 100 : 60);
    const eqScore    = Math.round(accuracy * 70 + speedScore * 0.15 + consScore * 0.15);

    let category;
    if      (eqScore >= 85) category = 'EXCELLENT';
    else if (eqScore >= 70) category = 'GOOD';
    else if (eqScore >= 55) category = 'AVERAGE';
    else if (eqScore >= 40) category = 'BELOW AVERAGE';
    else                     category = 'LOW';

    return {
      game: 'FACES',
      gameName: 'Faces Game',
      totalQuestions: TOTAL_QUESTIONS,
      correctCount,
      accuracy: Math.round(accuracy * 100) / 100,
      accuracyPct: `${Math.round(accuracy * 100)}%`,
      avgResponseMs: Math.round(avgRT),
      avgCorrectRtMs: Math.round(avgCorrectRT),
      avgIncorrectRtMs: Math.round(avgIncorrectRT),
      negativeEmotionErrors: negErrors,
      positiveEmotionErrors: posErrors,
      consistencyFirst:  Math.round(consistencyFirst * 100),
      consistencySecond: Math.round(consistencySecond * 100),
      eqScore,
      category,
      responseLog,
      primary: {
        label: 'Emotion Recognition (EQ Score)',
        value: `${eqScore}/100 — ${category} (${Math.round(accuracy * 100)}% accurate)`,
        raw: eqScore
      },
      secondary: {
        accuracyPct: `${Math.round(accuracy * 100)}%`,
        avgResponseMs: Math.round(avgRT),
        negativeEmotionErrors: negErrors,
        consistencyScore: consScore
      }
    };
  }

  return { init, getResults };
})();
