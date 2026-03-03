/**
 * PYMETRIC ARCADE — Game 4: Hard or Easy Task Game
 *
 * Measures: Motivation, Effort, Decision-making
 * 12 rounds. Each round: choose EASY or HARD task, then perform it.
 *
 * EASY: press spacebar 20 times in 10 seconds (≈80% success rate)
 * HARD: press spacebar 50 times in 10 seconds (≈30% success rate)
 *
 * Rewards: EASY $0.30 | HARD $2.00
 */

window.HardEasyGame = (function () {
  'use strict';

  const TOTAL_ROUNDS = 12;

  const TASKS = {
    easy: {
      label: 'EASY TASK',
      presses: 20,
      duration: 10,
      reward: 0.30,
      successProb: 0.80,
      color: 'var(--color-pixel-green)',
      icon: '😊'
    },
    hard: {
      label: 'HARD TASK',
      presses: 50,
      duration: 10,
      reward: 2.00,
      successProb: 0.30,
      color: 'var(--color-pixel-red)',
      icon: '💪'
    }
  };

  let currentRound = 0;
  let totalEarnings = 0;
  let gameActive = false;

  // Per-round data
  let rounds = [];       // {roundIdx, choice, taskType, presses, required, succeeded, reward, choiceTime, taskDuration}
  let currentChoice = null;
  let choiceStartTime = 0;

  // Keypress task state
  let taskPresses = 0;
  let taskTimeLeft = 0;
  let taskInterval = null;
  let taskKeyHandler = null;
  let taskClickHandler = null;
  let taskStartTime = 0;
  let taskActive = false;

  function init() {
    currentRound = 0;
    totalEarnings = 0;
    rounds = [];
    gameActive = true;
    renderChoicePhase();
    updateHUD();
  }

  /* ── PHASE 1: Choice ── */
  function renderChoicePhase() {
    showPhase('choose');
    currentChoice = null;
    choiceStartTime = Date.now();

    const container = document.getElementById('he-choices');
    if (!container) return;
    container.innerHTML = '';

    ['easy', 'hard'].forEach(type => {
      const task = TASKS[type];
      const card = document.createElement('div');
      card.className = `task-choice-card ${type}`;
      card.innerHTML = `
        <div class="task-name">${task.icon} ${task.label}</div>
        <div class="task-reward">$${task.reward.toFixed(2)}</div>
        <div class="task-prob" style="margin-top:6px;">
          SUCCESS RATE: <b style="color:${task.color}">${Math.round(task.successProb * 100)}%</b>
        </div>
        <div class="task-prob" style="margin-top:4px;">
          GOAL: ${task.presses} presses / ${task.duration}s
        </div>
      `;
      card.onclick = () => chooseTask(type, card);
      container.appendChild(card);
    });

    document.getElementById('he-phase').textContent = 'CHOOSE';
    setHeFeedback('');
  }

  const sfx = (n) => { window.PymetricSounds && window.PymetricSounds[n] && window.PymetricSounds[n](); };

  function chooseTask(type, cardEl) {
    if (!gameActive || currentChoice) return;
    sfx('sfxClick');
    currentChoice = type;
    const choiceTime = Date.now() - choiceStartTime;

    // Highlight chosen
    document.querySelectorAll('.task-choice-card').forEach(c => c.style.opacity = '0.5');
    cardEl.style.opacity = '1';
    cardEl.style.transform = 'scale(1.04)';
    cardEl.style.boxShadow = `0 0 20px ${TASKS[type].color}`;

    setTimeout(() => startTask(type, choiceTime), 700);
  }

  /* ── PHASE 2: Task (keypress challenge) ── */
  function startTask(type, choiceTime) {
    const task = TASKS[type];
    showPhase('task');

    taskPresses = 0;
    taskTimeLeft = task.duration;
    taskActive = true;
    taskStartTime = Date.now();

    const taskLabel = document.getElementById('he-task-label');
    const kpTarget  = document.getElementById('he-kp-target');
    const timerEl   = document.getElementById('he-kp-timer');

    if (taskLabel) {
      taskLabel.textContent = task.label;
      taskLabel.style.color = task.color;
    }
    if (kpTarget) kpTarget.textContent = `GOAL: ${task.presses} PRESSES`;
    if (timerEl)  timerEl.textContent = task.duration;
    document.getElementById('he-phase').textContent = type.toUpperCase();

    // Keyboard handler
    taskKeyHandler = (e) => {
      if (e.code === 'Space') { e.preventDefault(); registerTaskPress(type); }
    };
    document.addEventListener('keydown', taskKeyHandler);

    // Click handler
    const area = document.getElementById('he-kp-area');
    taskClickHandler = (e) => { e.preventDefault(); registerTaskPress(type); };
    if (area) area.addEventListener('mousedown', taskClickHandler);

    // Timer
    taskInterval = setInterval(() => {
      taskTimeLeft--;
      if (timerEl) timerEl.textContent = taskTimeLeft;
      if (timerEl && taskTimeLeft <= 3) timerEl.style.color = 'var(--color-pixel-red)';
      if (taskTimeLeft <= 0) endTask(type, choiceTime);
    }, 1000);
  }

  function registerTaskPress(type) {
    if (!taskActive) return;
    taskPresses++;

    const area = document.getElementById('he-kp-area');
    if (area) {
      area.classList.add('pressed');
      clearTimeout(area._p);
      area._p = setTimeout(() => area.classList.remove('pressed'), 80);
    }

    // Early success
    if (taskPresses >= TASKS[type].presses) {
      endTask(type, null, true);
    }
  }

  function endTask(type, choiceTime, earlySuccess = false) {
    clearInterval(taskInterval);
    taskActive = false;

    document.removeEventListener('keydown', taskKeyHandler);
    const area = document.getElementById('he-kp-area');
    if (area && taskClickHandler) area.removeEventListener('mousedown', taskClickHandler);

    const task = TASKS[type];
    const succeeded = earlySuccess || taskPresses >= task.presses;
    const earned = succeeded ? task.reward : 0;
    totalEarnings += earned;

    const duration = (Date.now() - taskStartTime) / 1000;

    rounds.push({
      roundIdx:     currentRound,
      choice:       type,
      taskType:     type,
      presses:      taskPresses,
      required:     task.presses,
      succeeded,
      reward:       earned,
      choiceTimeMs: choiceTime || 0,
      taskDuration: Math.round(duration * 10) / 10
    });

    updateHUD();
    showResultPhase(type, succeeded, earned);
  }

  /* ── PHASE 3: Result ── */
  function showResultPhase(type, succeeded, earned) {
    showPhase('result');

    const icon = document.getElementById('he-result-icon');
    const text = document.getElementById('he-result-text');
    const sub  = document.getElementById('he-result-sub');

    sfx(succeeded ? 'sfxCorrect' : 'sfxWrong');
    if (icon) icon.textContent = succeeded ? '🏆' : '💔';
    if (text) {
      text.textContent = succeeded ? 'SUCCESS!' : 'FAILED';
      text.style.color = succeeded
        ? 'var(--color-pixel-green)'
        : 'var(--color-pixel-red)';
    }
    if (sub) {
      sub.textContent = succeeded
        ? `+$${earned.toFixed(2)} earned — Total: $${totalEarnings.toFixed(2)}`
        : `No reward — ${taskPresses}/${TASKS[type].presses} presses`;
    }
  }

  function nextRound() {
    currentRound++;
    if (currentRound >= TOTAL_ROUNDS) {
      finishGame();
      return;
    }
    renderChoicePhase();
    updateHUD();
  }

  function showPhase(phase) {
    ['choose', 'task', 'result'].forEach(p => {
      const el = document.getElementById(`he-${p}-phase`);
      if (el) el.style.display = p === phase ? '' : 'none';
    });
  }

  function updateHUD() {
    const roundEl    = document.getElementById('he-round');
    const earningsEl = document.getElementById('he-earnings');
    if (roundEl)    roundEl.textContent = `${Math.min(currentRound + 1, TOTAL_ROUNDS)} / ${TOTAL_ROUNDS}`;
    if (earningsEl) earningsEl.textContent = `$${totalEarnings.toFixed(2)}`;
  }

  function setHeFeedback(msg, style) {
    const el = document.getElementById('he-feedback');
    if (!el) return;
    el.textContent = msg;
    el.style.cssText = style || '';
  }

  function finishGame() {
    gameActive = false;
    if (window.PymetricApp) window.PymetricApp.gameFinished(4, getResults());
  }

  /* ── Scoring ── */
  function getResults() {
    const hardChoices   = rounds.filter(r => r.choice === 'hard');
    const easyChoices   = rounds.filter(r => r.choice === 'easy');
    const hardSuccesses = hardChoices.filter(r => r.succeeded);
    const hardFails     = hardChoices.filter(r => !r.succeeded);

    // Stability: did participant switch to easy after hard failure?
    let switchAfterFail = 0;
    for (let i = 1; i < rounds.length; i++) {
      if (rounds[i - 1].choice === 'hard' && !rounds[i - 1].succeeded && rounds[i].choice === 'easy') {
        switchAfterFail++;
      }
    }

    const hardProportion = hardChoices.length / TOTAL_ROUNDS;
    const avgChoiceTime  = rounds.reduce((s, r) => s + r.choiceTimeMs, 0) / (rounds.length || 1);

    // Motivation score: proportion of hard task choices + consistency
    const motivationScore = Math.round(
      (hardProportion * 60) +
      ((hardSuccesses.length / (hardChoices.length || 1)) * 30) +
      ((1 - switchAfterFail / (hardFails.length || 1)) * 10)
    );

    let motivationCategory;
    if      (motivationScore >= 80) motivationCategory = 'SANGAT TINGGI';
    else if (motivationScore >= 60) motivationCategory = 'TINGGI';
    else if (motivationScore >= 40) motivationCategory = 'SEDANG';
    else if (motivationScore >= 20) motivationCategory = 'RENDAH';
    else                             motivationCategory = 'SANGAT RENDAH';

    return {
      game: 'HARD_EASY',
      gameName: 'Hard or Easy Task Game',
      totalRounds: TOTAL_ROUNDS,
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      hardChoicesCount:   hardChoices.length,
      easyChoicesCount:   easyChoices.length,
      hardProportion:     Math.round(hardProportion * 100) / 100,
      hardSuccesses:      hardSuccesses.length,
      switchAfterFail,
      avgChoiceTimeMs:    Math.round(avgChoiceTime),
      motivationScore,
      motivationCategory,
      roundDetails: rounds,
      primary: {
        label: 'Motivation / Challenge Preference',
        value: `${motivationScore}/100 — ${motivationCategory} (${hardChoices.length}/${TOTAL_ROUNDS} hard)`,
        raw: motivationScore
      },
      secondary: {
        hardProportion: `${Math.round(hardProportion * 100)}%`,
        switchAfterFail,
        avgChoiceTimeMs: Math.round(avgChoiceTime),
        totalEarnings: `$${totalEarnings.toFixed(2)}`
      }
    };
  }

  return { init, nextRound: nextRound, getResults };
})();

/* Global wrappers */
function heNextRound() { window.HardEasyGame && window.HardEasyGame.nextRound(); }
