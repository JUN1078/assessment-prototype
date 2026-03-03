/**
 * PYMETRIC ARCADE — Game 2: Tower Game (Tower of Hanoi)
 *
 * Measures: Planning Ability, Problem-solving
 * Based on: Tower of Hanoi / Tower of London
 *
 * 5 disks, 3 pegs. Optimal = 31 moves.
 * Target: all disks on peg 3 in same order.
 */

window.TowerGame = (function () {
  'use strict';

  const sfx = (n) => { window.PymetricSounds && window.PymetricSounds[n] && window.PymetricSounds[n](); };

  const NUM_DISKS = 5;
  const OPTIMAL_MOVES = 31;

  // Disk colours (largest first)
  const DISK_COLORS = ['#9b59b6', '#4169e1', '#2ecc71', '#ffd32a', '#ff4757'];
  const DISK_WIDTHS = [200, 170, 140, 110, 80]; // px

  let pegs = [[], [], []];     // peg[0] = starting peg, each item = disk size (1=smallest)
  let selected = null;         // index of selected peg (0,1,2) or null
  let moves = 0;
  let violations = 0;
  let timerInterval = null;
  let elapsedSeconds = 0;
  let startTime = 0;
  let firstMoveTime = null;
  let gameComplete = false;
  let moveHistory = [];        // {from, to, diskSize, timestamp}

  function init() {
    // Setup initial state: all disks on peg 0, largest at bottom (index 0 = largest)
    pegs = [
      [5, 4, 3, 2, 1], // bottom to top: disk5 (largest) ... disk1 (smallest)
      [],
      []
    ];
    selected = null;
    moves = 0;
    violations = 0;
    elapsedSeconds = 0;
    startTime = Date.now();
    firstMoveTime = null;
    gameComplete = false;
    moveHistory = [];

    renderBoard();
    startTimer();
    updateHUD();
  }

  function startTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      elapsedSeconds = Math.round((Date.now() - startTime) / 1000);
      updateTimerDisplay();
    }, 1000);
  }

  function updateTimerDisplay() {
    const el = document.getElementById('tower-timer');
    if (!el) return;
    const m = Math.floor(elapsedSeconds / 60);
    const s = elapsedSeconds % 60;
    el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    el.className = 'timer-display' + (elapsedSeconds > 120 ? ' warning' : '');
  }

  function updateHUD() {
    const movesEl = document.getElementById('tower-moves');
    if (movesEl) movesEl.textContent = moves;
  }

  /* ── Click on a peg ── */
  function clickPeg(pegIdx) {
    if (gameComplete) return;

    if (selected === null) {
      // Select peg (must have disks)
      if (pegs[pegIdx].length === 0) {
        setFeedback('EMPTY PEG — SELECT A PEG WITH DISKS', 'color:var(--color-pixel-yellow)');
        return;
      }
      selected = pegIdx;
      renderBoard();
      setFeedback(`PEG ${pegIdx + 1} SELECTED — CLICK TARGET PEG`, 'color:var(--color-pixel-blue)');
    } else {
      // Attempt to move
      if (selected === pegIdx) {
        // Deselect
        selected = null;
        renderBoard();
        setFeedback('DESELECTED', '');
        return;
      }

      const fromDisk = pegs[selected][pegs[selected].length - 1]; // top disk
      const toPeg    = pegs[pegIdx];
      const toDisk   = toPeg.length > 0 ? toPeg[toPeg.length - 1] : Infinity;

      if (fromDisk < toDisk) {
        // Valid move
        sfx('sfxMove');
        if (!firstMoveTime) firstMoveTime = Date.now();
        pegs[selected].pop();
        pegs[pegIdx].push(fromDisk);
        moveHistory.push({ from: selected, to: pegIdx, diskSize: fromDisk, timestamp: Date.now() });
        moves++;
        selected = null;
        renderBoard();
        updateHUD();
        setFeedback(`DISK ${fromDisk} MOVED TO PEG ${pegIdx + 1}`, 'color:var(--color-pixel-green)');
        checkWin();
      } else {
        // Invalid move
        sfx('sfxWrong');
        violations++;
        selected = null;
        renderBoard();
        setFeedback('✗ INVALID! CANNOT PLACE LARGER DISK ON SMALLER', 'color:var(--color-pixel-red)');
        document.getElementById('tower-board').classList.add('anim-shake');
        setTimeout(() => document.getElementById('tower-board').classList.remove('anim-shake'), 600);
      }
    }
  }

  /* ── Win check ── */
  function checkWin() {
    // Win = all 5 disks on peg 2 (index 2)
    if (pegs[2].length === NUM_DISKS) {
      clearInterval(timerInterval);
      gameComplete = true;
      sfx('sfxComplete');
      setFeedback('🏆 PUZZLE SOLVED! WELL DONE!', 'color:var(--color-pixel-yellow);font-size:14px;');
      const doneBtn = document.getElementById('btnTowerDone');
      if (doneBtn) doneBtn.textContent = '🏆 DONE → NEXT';
    }
  }

  /* ── Render the board ── */
  function renderBoard() {
    const board = document.getElementById('tower-board');
    if (!board) return;

    board.innerHTML = '';

    for (let pi = 0; pi < 3; pi++) {
      const peg = document.createElement('div');
      peg.className = 'tower-peg' + (pi === selected ? ' selected' : '');
      peg.onclick = () => clickPeg(pi);
      peg.title = `Peg ${pi + 1}`;

      // Label
      const label = document.createElement('div');
      label.style.cssText = `position:absolute;bottom:-24px;font-family:var(--font-pixel);font-size:10px;color:var(--color-pixel-lightGray);letter-spacing:1px;`;
      label.textContent = pi === selected ? `◀ PEG ${pi + 1} ▶` : `PEG ${pi + 1}`;
      peg.appendChild(label);

      // Disks (bottom to top)
      pegs[pi].forEach((diskSize, idx) => {
        const disk = document.createElement('div');
        disk.className = 'disk';
        const colorIdx = NUM_DISKS - diskSize; // largest disk = index 0
        disk.style.width  = `${DISK_WIDTHS[colorIdx]}px`;
        disk.style.background = DISK_COLORS[colorIdx];
        disk.style.borderColor = 'rgba(0,0,0,0.4)';
        disk.style.zIndex = idx + 1;
        // Add disk number label
        disk.style.display = 'flex';
        disk.style.alignItems = 'center';
        disk.style.justifyContent = 'center';
        disk.style.fontFamily = 'var(--font-pixel)';
        disk.style.fontSize = '9px';
        disk.style.color = 'rgba(255,255,255,0.8)';
        disk.textContent = diskSize;
        peg.appendChild(disk);
      });

      board.appendChild(peg);
    }
  }

  function setFeedback(msg, style) {
    const el = document.getElementById('tower-feedback');
    if (!el) return;
    el.innerHTML = msg;
    el.style.cssText = style || '';
  }

  function reset() {
    clearInterval(timerInterval);
    init();
    setFeedback('BOARD RESET', 'color:var(--color-pixel-yellow)');
  }

  function finish() {
    if (!gameComplete) {
      clearInterval(timerInterval);
      gameComplete = true;
      setFeedback('SESSION ENDED MANUALLY', 'color:var(--color-pixel-lightGray)');
    }
    // Signal to app controller
    if (window.PymetricApp) window.PymetricApp.gameFinished(2, getResults());
  }

  /* ── Scoring ── */
  function getResults() {
    const efficiency = moves - OPTIMAL_MOVES;
    const solved = pegs[2].length === NUM_DISKS;

    let planningScore;
    if (!solved) {
      planningScore = 0;
    } else if (efficiency === 0) {
      planningScore = 100;
    } else if (efficiency <= 10) {
      planningScore = Math.round(90 - efficiency * 3);
    } else if (efficiency <= 30) {
      planningScore = Math.round(60 - (efficiency - 10) * 1.5);
    } else {
      planningScore = Math.max(10, 30 - efficiency);
    }

    let category;
    if      (planningScore >= 90) category = 'EXCELLENT';
    else if (planningScore >= 70) category = 'GOOD';
    else if (planningScore >= 50) category = 'AVERAGE';
    else if (planningScore >= 30) category = 'BELOW AVERAGE';
    else                           category = 'LOW';

    return {
      game: 'TOWER',
      gameName: 'Tower Game',
      solved,
      totalMoves: moves,
      optimalMoves: OPTIMAL_MOVES,
      excessMoves: efficiency,
      violations,
      durationSeconds: elapsedSeconds,
      planningTimeSec: firstMoveTime ? Math.round((firstMoveTime - startTime) / 1000) : null,
      planningScore,
      category,
      moveHistory,
      primary: {
        label: 'Planning Score',
        value: `${planningScore}/100 — ${category}`,
        raw: planningScore
      },
      secondary: {
        solved,
        totalMoves: moves,
        excessMoves: efficiency,
        violations,
        durationSeconds: elapsedSeconds,
        planningTimeSec: firstMoveTime ? Math.round((firstMoveTime - startTime) / 1000) : null
      }
    };
  }

  return { init, clickPeg, reset, finish, getResults };
})();

/* Global wrappers */
function towerReset()  { window.TowerGame && window.TowerGame.reset(); }
function towerFinish() { window.TowerGame && window.TowerGame.finish(); }
