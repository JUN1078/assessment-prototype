/**
 * PYMETRIC ARCADE — Main App Controller
 *
 * Orchestrates:
 *   - Session initialization
 *   - System check UI (camera, network Mbps, mic, second screen, screen share)
 *   - Arcade lobby (mission select screen)
 *   - Game sequencing (1→2→3→4→5→6)
 *   - Proctoring integration
 *   - Results collection and display
 */

window.PymetricApp = (function () {
  'use strict';

  const GAMES = [
    {
      id: 1, name: 'BALLOON GAME', icon: '🎈',
      tags: [['badge-red','RISK'],['badge-blue','DECISION']],
      desc: 'Pump balloons to earn points. Risk losing everything if the balloon pops!',
      instructions: `
        <b>1.</b> Click <b>PUMP</b> to inflate the balloon and earn <b>Rp 500</b> per pump.<br>
        <b>2.</b> Click <b>SAVE</b> to keep your earnings before the balloon explodes.<br>
        <b>3.</b> If the balloon explodes, you lose all unsaved earnings for that round.<br>
        <b>4.</b> Each balloon has a hidden explosion point — you won't know when it will pop!<br>
        <b>5.</b> 3 balloons total: <span style="color:#ff8c40">●ORANGE</span>, <span style="color:#ffd700">●YELLOW</span>, <span style="color:#4a6cc0">●BLUE</span>
      `,
      module: () => window.BalloonGame,
      initFn: 'init'
    },
    {
      id: 2, name: 'TOWER GAME', icon: '🗼',
      tags: [['badge-purple','PLANNING'],['badge-blue','PROBLEM-SOLVE']],
      desc: 'Move all disks from Peg 1 to Peg 3 following the rules. Fewest moves wins!',
      instructions: `
        <b>1.</b> Click a peg to select it, then click another peg to move the top disk.<br>
        <b>2.</b> You can only move one disk at a time.<br>
        <b>3.</b> A larger disk CANNOT be placed on a smaller disk.<br>
        <b>4.</b> Goal: move all <b>5 disks</b> to Peg 3 in correct order.<br>
        <b>5.</b> Optimal solution: <b>31 moves</b>. Try to get as close as possible!<br>
        <b>6.</b> Click <b>DONE</b> when finished, or <b>RESET</b> to start over.
      `,
      module: () => window.TowerGame,
      initFn: 'init',
      hasDoneButton: true
    },
    {
      id: 3, name: 'KEYPRESS GAME', icon: '⌨️',
      tags: [['badge-green','MOTOR SPEED'],['badge-yellow','EFFORT']],
      desc: 'Press SPACEBAR as many times as possible in 30 seconds!',
      instructions: `
        <b>1.</b> Press <b>SPACEBAR</b> (or click the area) as fast as you can.<br>
        <b>2.</b> You have <b>30 seconds</b> total.<br>
        <b>3.</b> The count is hidden — just focus on pressing as fast as possible!<br>
        <b>4.</b> Stay consistent throughout the full 30 seconds.
      `,
      module: () => window.KeypressGame,
      initFn: 'init'
    },
    {
      id: 4, name: 'HARD OR EASY', icon: '⚖️',
      tags: [['badge-yellow','MOTIVATION'],['badge-red','DECISION']],
      desc: 'Choose between easy tasks (low reward) or hard tasks (high reward). 12 rounds.',
      instructions: `
        <b>1.</b> Each round, choose <span style="color:#3ddc84">EASY</span> or <span style="color:#ff6b8a">HARD</span> task.<br>
        <b>2.</b> <b>Easy:</b> 20 presses in 10s → <b>$0.30</b> reward (80% success rate)<br>
        <b>3.</b> <b>Hard:</b> 50 presses in 10s → <b>$2.00</b> reward (30% success rate)<br>
        <b>4.</b> Earn reward only if you succeed at the chosen task.<br>
        <b>5.</b> No penalties for choosing wrong — just no reward if you fail!<br>
        <b>6.</b> 12 rounds total.
      `,
      module: () => window.HardEasyGame,
      initFn: 'init'
    },
    {
      id: 5, name: 'LENGTHS GAME', icon: '📏',
      tags: [['badge-blue','QUANTITATIVE'],['badge-green','ATTENTION']],
      desc: 'Click the LONGER bar as quickly and accurately as possible. 20 questions.',
      instructions: `
        <b>1.</b> Two bars are displayed (A and B).<br>
        <b>2.</b> Click the <b>longer bar</b> as quickly as possible.<br>
        <b>3.</b> Bars get increasingly similar in length — stay focused!<br>
        <b>4.</b> Speed AND accuracy both matter.<br>
        <b>5.</b> 20 questions total.
      `,
      module: () => window.LengthsGame,
      initFn: 'init'
    },
    {
      id: 6, name: 'FACES GAME', icon: '😊',
      tags: [['badge-purple','EMOTION EQ'],['badge-yellow','EMPATHY']],
      desc: 'Identify the emotion shown in each face. 16 questions.',
      instructions: `
        <b>1.</b> An emoji face will appear.<br>
        <b>2.</b> Click the emotion label that best describes the expression.<br>
        <b>3.</b> Respond as quickly and accurately as possible.<br>
        <b>4.</b> Some expressions are ambiguous — go with your first instinct!<br>
        <b>5.</b> 16 questions total (each emotion shown twice for consistency).
      `,
      module: () => window.FacesGame,
      initFn: 'init'
    }
  ];

  let currentGameIdx = 0;
  let gameResults    = {};
  let sessionInfo    = {};

  /* ── Helpers ── */
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function sfx(name) { window.PymetricSounds && window.PymetricSounds[name] && window.PymetricSounds[name](); }

  /* ── Initialization sequence ── */
  async function boot() {
    sessionInfo = {
      name:      sessionStorage.getItem('pymetric_name') || 'Anonymous',
      id:        sessionStorage.getItem('pymetric_id')   || '—',
      role:      sessionStorage.getItem('pymetric_role') || '—',
      startTime: parseInt(sessionStorage.getItem('pymetric_start') || Date.now())
    };
    const nameEl = document.getElementById('disp-name');
    const idEl   = document.getElementById('disp-id');
    if (nameEl) nameEl.textContent = sessionInfo.name;
    if (idEl)   idEl.textContent   = sessionInfo.id;

    setStatus('RUNNING SYSTEM CHECKS...');

    // Wire up proctoring violation handler
    try {
      await window.PymetricProctor.init({
        onViolation: (entry) => {
          console.warn('[PROCTOR]', entry);
          sfx('sfxWarning');
        }
      });
    } catch (e) {
      console.warn('[PROCTOR] Init error:', e);
    }

    await sleep(300);
    await runSystemCheckUI();
  }

  function setStatus(msg) {
    const el = document.getElementById('init-status');
    if (el) el.textContent = msg;
  }

  /* ── System check UI flow ── */
  let _checksPassed = false;

  async function runSystemCheckUI() {
    // Show device info panel before checks start
    _renderDeviceInfo();

    // 1. Camera — check first (fast)
    setCheckItem('chk-camera', '', '⏳ CHECKING...');
    await sleep(200);

    // 2. Network — pass live-update callback so Mbps ticks up in real time
    setCheckItem('chk-network', '', '⏳ MEASURING...');

    // Run all checks; network streams progress via callback
    const results = await window.PymetricProctor.runSystemCheck({
      onNetworkProgress: (mbps) => {
        setCheckItem('chk-network', '', `⏳ ${mbps} Mbps...`);
      }
    });

    // Render camera result
    setCheckItem('chk-camera',
      results.camera.ok ? 'pass' : 'fail',
      results.camera.ok ? '✓ ' + results.camera.msg : '✗ ' + results.camera.msg
    );

    // Render network result
    const netOk = results.network.ok;
    const latStr = results.network.latencyMs != null ? ` | Ping ${results.network.latencyMs}ms` : '';
    setCheckItem('chk-network',
      netOk ? 'pass' : 'warn',
      netOk
        ? `✓ ${results.network.msg}${latStr}`
        : `⚠ ${results.network.msg} — MIN 5 Mbps REQUIRED${latStr}`
    );

    // 3. Microphone
    setCheckItem('chk-mic',
      results.mic.ok ? 'pass' : 'warn',
      results.mic.ok ? '✓ ' + results.mic.msg : '⚠ ' + results.mic.msg
    );

    // 4. Second screen
    setCheckItem('chk-screen',
      results.dualScreen.ok ? 'pass' : 'warn',
      results.dualScreen.ok ? '✓ ' + results.dualScreen.msg : '⚠ ' + results.dualScreen.msg
    );

    // 5. Browser compatibility
    if (results.device) {
      const d = results.device;
      setCheckItem('chk-browser',
        d.browserOk ? 'pass' : 'warn',
        d.browserOk
          ? `✓ ${d.browser} v${d.browserVersion}`
          : `⚠ ${d.browser} — USE CHROME OR EDGE (v110+)`
      );
    }

    // 6. Screen share — needs user gesture
    setCheckItem('chk-share', '', '⏳ CLICK BUTTON BELOW');
    setStatus('CLICK "SHARE YOUR SCREEN" TO CONTINUE');

    const shareBtn  = document.getElementById('btn-share-screen');
    const shareHint = document.getElementById('share-hint');
    if (shareBtn)  shareBtn.style.display  = 'inline-block';
    if (shareHint) shareHint.style.display = 'block';

    _checksPassed = results.camera.ok && results.network.ok;
  }

  /* Render device info panel */
  function _renderDeviceInfo() {
    const d = window.PymetricProctor.detectDevice();
    const panel = document.getElementById('device-info-panel');
    if (!panel || !d) return;

    const row = (label, val, ok) =>
      `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="color:var(--gba-text-dim);font-size:9px;letter-spacing:1px;">${label}</span>
        <span style="color:${ok === false ? 'var(--gba-red)' : ok === true ? 'var(--gba-green)' : 'var(--gba-text)'};font-size:9px;">${val}</span>
      </div>`;

    panel.innerHTML =
      row('OS',      d.os,                         null) +
      row('BROWSER', `${d.browser} v${d.browserVersion}`, d.browserOk) +
      row('DEVICE',  d.deviceType,                 d.deviceOk) +
      row('SCREEN',  d.screen,                     d.screenOk) +
      row('RAM',     d.ram,                        d.ramOk) +
      row('CPU',     `${d.cpuCores} cores`,        d.cpuOk) +
      row('GPU',     d.gpu.length > 30 ? d.gpu.substring(0, 28) + '…' : d.gpu, null);

    panel.style.display = 'block';
  }

  function setCheckItem(id, cls, statusText) {
    const el = document.getElementById(id);
    if (!el) return;
    if (cls) el.className = `check-item ${cls}`;
    const statusEl = el.querySelector('.chk-status');
    const iconEl   = el.querySelector('.chk-icon');
    if (statusEl) statusEl.textContent = statusText;
    if (iconEl) {
      if (cls === 'pass') iconEl.textContent = '✓';
      else if (cls === 'fail') iconEl.textContent = '✗';
      else if (cls === 'warn') iconEl.textContent = '⚠';
    }
    sfx('sfxSelect');
  }

  /* Called by "SHARE YOUR SCREEN" button */
  window.triggerScreenShare = async function () {
    const btn = document.getElementById('btn-share-screen');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ SHARING...'; }

    sfx('sfxClick');
    const ok = await window.PymetricProctor.requestScreenShare();

    setCheckItem('chk-share',
      ok ? 'pass' : 'warn',
      ok ? '✓ SCREEN SHARED' : '⚠ SKIPPED — SESSION FLAGGED'
    );

    if (btn) btn.style.display = 'none';
    const shareHint = document.getElementById('share-hint');
    if (shareHint) shareHint.style.display = 'none';

    setStatus(_checksPassed ? 'ALL CHECKS DONE — READY TO START' : 'CHECKS DONE — SOME ISSUES DETECTED');

    const proceedBtn = document.getElementById('btn-proceed');
    const noteEl     = document.getElementById('check-note');
    if (proceedBtn) proceedBtn.style.display = 'inline-block';
    if (noteEl && !_checksPassed) noteEl.style.display = 'block';
  };

  /* Called by "PROCEED" button */
  window.proceedToAssessment = function () {
    sfx('sfxClick');
    if (window._stopDinoGame) window._stopDinoGame();
    window.PymetricProctor.activate();
    showLobby();
  };

  /* ── Arcade Lobby (Mission Select) ── */
  function showLobby() {
    showScreen('screen-lobby');

    // Set player name
    const nameEl = document.getElementById('lobby-player-name');
    if (nameEl) nameEl.textContent = sessionInfo.name.toUpperCase();

    // Build game cards
    // Lobby card PNG assets
    const CARD_STATE_ASSETS = {
      done:   'assets/ui/card-completed.png',
      next:   'assets/ui/card-next.png',
      locked: 'assets/ui/card-locked.png'
    };
    const GAME_THUMB_ASSETS = {
      1: 'assets/ui/gamelist-balloon.png',
      2: 'assets/ui/gamelist-tower.png',
      3: 'assets/ui/gamelist-keypress.png',
      4: 'assets/ui/gamelist-cards.png',  // closest match for hard/easy
      5: 'assets/icons/union-10.png',     // green ruler icon for lengths
      6: 'assets/ui/gamelist-faces.png'
    };
    // Inactive icon variants for locked state
    const GAME_ICON_LOCKED = {
      1: 'assets/icons/union-7.png',  // gray target
      2: 'assets/icons/union-9.png',  // gray card
      3: 'assets/icons/union-3.png',  // gray keyboard
      4: 'assets/icons/union-9.png',  // gray card
      5: 'assets/icons/union-11.png', // gray ruler
      6: 'assets/icons/union-5.png'   // gray smiley
    };

    const grid = document.getElementById('lobby-grid');
    if (grid) {
      grid.innerHTML = '';
      GAMES.forEach((game, idx) => {
        const card = document.createElement('div');
        const isDone = !!gameResults[game.id];
        const isNext = !isDone && idx === currentGameIdx;
        const stateKey = isDone ? 'done' : isNext ? 'next' : 'locked';
        card.className = 'lobby-card' +
          (isDone ? ' done' : isNext ? ' next-up' : ' locked');

        // Apply card state PNG as background overlay
        const stateAsset = CARD_STATE_ASSETS[stateKey];
        card.style.backgroundImage = `url('${stateAsset}')`;
        card.style.backgroundSize = 'cover';
        card.style.backgroundPosition = 'center';
        card.style.backgroundRepeat = 'no-repeat';
        card.style.imageRendering = 'pixelated';

        // Game thumbnail — use active or locked variant based on state
        const thumbAsset = stateKey === 'locked' && GAME_ICON_LOCKED[game.id]
          ? GAME_ICON_LOCKED[game.id]
          : GAME_THUMB_ASSETS[game.id];
        const thumbHTML = thumbAsset
          ? `<img src="${thumbAsset}" alt="${game.name}" style="width:48px;height:auto;image-rendering:pixelated;margin:4px auto;display:block;${stateKey === 'locked' ? 'opacity:0.4;filter:grayscale(1);' : ''}">`
          : `<div class="lobby-card-icon">${game.icon}</div>`;

        card.innerHTML = `
          <div class="lobby-card-num">0${game.id}</div>
          ${thumbHTML}
          <div class="lobby-card-name">${game.name}</div>
          <div class="lobby-card-tags">
            ${game.tags.map(([cls, lbl]) =>
              `<span class="badge ${cls}" style="font-size:7px;padding:2px 4px;">${lbl}</span>`
            ).join('')}
          </div>
          <div class="lobby-card-status ${isDone ? 'lcs-done' : isNext ? 'lcs-next' : 'lcs-locked'}">
            ${isDone ? '✓ DONE' : isNext ? '▶ NEXT' : '⬛ LOCKED'}
          </div>
        `;
        grid.appendChild(card);
      });
    }

    // Start BGM on user interaction (proceedToAssessment is user gesture)
    window.PymetricSounds && window.PymetricSounds.startBGM();
  }

  /* Called by lobby START button — defined in return object below */

  /* ── Sidebar update ── */
  function updateSidebar(activeGame) {
    for (let i = 1; i <= 6; i++) {
      const el = document.getElementById(`sidebar-${i}`);
      if (!el) continue;
      el.className = 'sidebar-game-item';
      if (gameResults[i])         el.classList.add('done');
      else if (i === activeGame)  el.classList.add('active');
      else if (i > activeGame)    el.classList.add('locked');
      const num = el.querySelector('.s-num');
      if (num) num.textContent = gameResults[i] ? '✓' : i;
    }
    const ssEl = document.getElementById('ss-current');
    const prEl = document.getElementById('ss-progress');
    if (ssEl) ssEl.textContent = GAMES[activeGame - 1]?.name || '—';
    if (prEl) prEl.textContent = `${Object.keys(gameResults).length}/6`;
  }

  /* ── Screen management ── */
  function showScreen(id) {
    document.querySelectorAll('.game-screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
  }

  /* ── Game intro screen ── */
  function showGameIntro(gameIdx) {
    currentGameIdx = gameIdx;
    const game = GAMES[gameIdx];
    updateSidebar(game.id);

    document.getElementById('intro-icon').textContent = game.icon;
    document.getElementById('intro-title').textContent = game.name;
    document.getElementById('intro-desc').textContent = game.desc;
    document.getElementById('intro-instructions').innerHTML = game.instructions;

    showScreen('screen-game-intro');

    const beginBtn = document.getElementById('btnBeginGame');
    if (beginBtn) {
      beginBtn.onclick = () => beginGame(gameIdx);
    }

    const spaceHandler = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        document.removeEventListener('keydown', spaceHandler);
        beginGame(gameIdx);
      }
    };
    document.addEventListener('keydown', spaceHandler);
  }

  /* ── Begin a game ── */
  function beginGame(gameIdx) {
    sfx('sfxStart');
    const game = GAMES[gameIdx];
    showScreen(`screen-game-${game.id}`);
    updateSidebar(game.id);

    const mod = game.module();
    if (mod && mod[game.initFn]) {
      mod[game.initFn]();
    }

    if (game.id === 2) setupTowerClicks();
  }

  /* Tower: wire keyboard shortcuts */
  function setupTowerClicks() {
    const towerKeyHandler = (e) => {
      if (!document.getElementById('screen-game-2').classList.contains('active')) {
        document.removeEventListener('keydown', towerKeyHandler);
        return;
      }
      const pegMap = { '1': 0, '2': 1, '3': 2 };
      if (e.key in pegMap) {
        window.TowerGame && window.TowerGame.clickPeg(pegMap[e.key]);
      }
    };
    document.addEventListener('keydown', towerKeyHandler);
  }

  /* ── Called by each game when it finishes ── */
  function gameFinished(gameId, results) {
    gameResults[gameId] = results;
    sfx('sfxComplete');
    updateSidebar(gameId + 1);

    const nextIdx = currentGameIdx + 1;
    setTimeout(() => {
      if (nextIdx < GAMES.length) {
        currentGameIdx = nextIdx;
        // Return to lobby to show updated progress before next game intro
        showLobby();
        // Auto-advance to game intro after short delay
        setTimeout(() => showGameIntro(nextIdx), 1800);
      } else {
        showFinalResults();
      }
    }, 1200);
  }

  /* ── Dev cheat: skip current game (Ctrl+Shift+X or sidebar button) ── */
  function cheatSkip() {
    const game = GAMES[currentGameIdx];
    if (!game) return;
    // Tower has its own finish() that calls gameFinished internally
    if (game.id === 2 && window.TowerGame) { window.TowerGame.finish(); return; }
    // Keypress has a cleanup() to stop timer + key listener
    if (game.id === 3 && window.KeypressGame) window.KeypressGame.cleanup();
    const mod = game.module();
    const results = mod && mod.getResults ? mod.getResults() : { game: game.name, skipped: true };
    gameFinished(game.id, results);
  }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyX') { e.preventDefault(); cheatSkip(); }
  });

  window.pymetricCheatSkip = cheatSkip;

  /* ── Captures gallery renderer ── */
  function _renderCapturesGallery(captures) {
    const el = document.getElementById('final-captures');
    if (!el) return;

    if (!captures || captures.length === 0) {
      el.innerHTML = `
        <div style="font-family:var(--font-pixel);font-size:9px;color:var(--gba-card-border);letter-spacing:1px;padding:8px 0;">
          NO CAPTURES RECORDED — SCREEN SHARE OR CAMERA NOT ACTIVE
        </div>`;
      return;
    }

    const fmt = (ms) => {
      const d = new Date(ms);
      return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    el.innerHTML = captures.map((cap, i) => {
      const camHTML = cap.camera
        ? `<div class="capture-img-wrap">
             <div class="capture-img-label">📷 CAMERA (320×240)</div>
             <img class="cam-thumb" src="${cap.camera}" alt="cam-${i}"
               onclick="openLightbox(this.src,'CAPTURE ${i + 1} — CAMERA @ ${fmt(cap.timestamp)}')"
               title="Click to enlarge">
           </div>`
        : `<div class="capture-img-wrap"><div class="capture-no-data">📷 CAM — NO DATA</div></div>`;

      const scrHTML = cap.screen
        ? `<div class="capture-img-wrap">
             <div class="capture-img-label">🖥 SCREEN (640×360)</div>
             <img class="scr-thumb" src="${cap.screen}" alt="scr-${i}"
               onclick="openLightbox(this.src,'CAPTURE ${i + 1} — SCREEN @ ${fmt(cap.timestamp)}')"
               title="Click to enlarge">
           </div>`
        : `<div class="capture-img-wrap"><div class="capture-no-data">🖥 SCREEN — NOT SHARED</div></div>`;

      return `
        <div class="capture-entry">
          <div class="capture-header">
            <span>▶ CAPTURE #${i + 1}</span>
            <span>🕒 ${fmt(cap.timestamp)}</span>
            <span>⏱ T+${cap.elapsed}s INTO SESSION</span>
          </div>
          <div class="capture-images">
            ${camHTML}
            ${scrHTML}
          </div>
        </div>`;
    }).join('');
  }

  /* ── Final results screen ── */
  function showFinalResults() {
    window.PymetricProctor.deactivate();
    window.PymetricSounds && window.PymetricSounds.stopBGM();
    showScreen('screen-done');
    updateSidebar(7);

    sfx('sfxVictory');

    // Player info
    const playerEl = document.getElementById('final-player-info');
    if (playerEl) {
      playerEl.innerHTML = `
        <div class="result-metric"><span class="result-metric-label">Name</span><span class="result-metric-value">${sessionInfo.name}</span></div>
        <div class="result-metric"><span class="result-metric-label">ID</span><span class="result-metric-value">${sessionInfo.id}</span></div>
        <div class="result-metric"><span class="result-metric-label">Role</span><span class="result-metric-value">${sessionInfo.role}</span></div>
        <div class="result-metric"><span class="result-metric-label">Duration</span><span class="result-metric-value">${Math.round((Date.now() - sessionInfo.startTime) / 60000)} min</span></div>
      `;
    }

    // Proctoring report
    const proctorReport = window.PymetricProctor.getReport();
    const proctorEl = document.getElementById('final-proctor-log');
    if (proctorEl) {
      const integrityColor = proctorReport.integrityScore >= 80
        ? 'var(--gba-green)'
        : proctorReport.integrityScore >= 50
          ? 'var(--gba-gold)'
          : 'var(--gba-red)';

      proctorEl.innerHTML = `
        <div class="result-metric">
          <span class="result-metric-label">Integrity Score</span>
          <span class="result-metric-value" style="color:${integrityColor}">${proctorReport.integrityScore}/100</span>
        </div>
        <div class="result-metric"><span class="result-metric-label">Total Violations</span><span class="result-metric-value">${proctorReport.totalWarnings}</span></div>
        <div class="result-metric"><span class="result-metric-label">Tab Switches</span><span class="result-metric-value">${proctorReport.tabSwitches}</span></div>
        <div class="result-metric"><span class="result-metric-label">Face Warnings</span><span class="result-metric-value">${proctorReport.faceWarnings}</span></div>
        <div class="result-metric"><span class="result-metric-label">Captures Taken</span><span class="result-metric-value">${proctorReport.captureCount}</span></div>
        <div class="result-metric"><span class="result-metric-label">Session Duration</span><span class="result-metric-value">${proctorReport.sessionDuration}s</span></div>
      `;

      if (proctorReport.violations.length > 0) {
        let table = `<table class="pixel-table" style="margin-top:12px;font-size:10px;">
          <tr><th>#</th><th>Type</th><th>Detail</th><th>Time (s)</th></tr>`;
        proctorReport.violations.forEach((v, i) => {
          table += `<tr><td>${i + 1}</td><td>${v.type}</td><td>${v.detail}</td><td>${v.elapsed}s</td></tr>`;
        });
        table += '</table>';
        proctorEl.innerHTML += table;
      }
    }

    // Captures gallery
    _renderCapturesGallery(proctorReport.captures || []);

    // Game results
    const gamesEl = document.getElementById('final-game-results');
    if (gamesEl) {
      gamesEl.innerHTML = GAMES.map(game => {
        const res = gameResults[game.id];
        if (!res) return '';
        return `
          <div class="result-box" style="margin-bottom:16px;">
            <div class="result-title">${game.icon} ${game.name}</div>
            <div class="result-metric" style="margin-top:12px;">
              <span class="result-metric-label">${res.primary.label}</span>
              <span class="result-metric-value">${res.primary.value}</span>
            </div>
            ${Object.entries(res.secondary || {}).map(([k, v]) => `
              <div class="result-metric">
                <span class="result-metric-label">${k.replace(/([A-Z])/g, ' $1').toUpperCase()}</span>
                <span class="result-metric-value">${v}</span>
              </div>
            `).join('')}
          </div>
        `;
      }).join('');
    }
  }

  /* ── Download results as JSON ── */
  function downloadResults() {
    sfx('sfxClick');
    const proctorReport = window.PymetricProctor.getReport();
    const fullReport = {
      session: {
        ...sessionInfo,
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - sessionInfo.startTime
      },
      proctoring: proctorReport,
      games: gameResults
    };

    const blob = new Blob([JSON.stringify(fullReport, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `pymetric_${sessionInfo.id}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ── Public API ── */
  return {
    boot,
    gameFinished,
    downloadResults,
    startMission: function () {
      sfx('sfxStart');
      showGameIntro(currentGameIdx);
    }
  };
})();

/* Global wrappers */
function downloadResults() { window.PymetricApp && window.PymetricApp.downloadResults(); }

/* Lightbox for captures */
function openLightbox(src, label) {
  const lb    = document.getElementById('capture-lightbox');
  const img   = document.getElementById('capture-lightbox-img');
  const lbl   = document.getElementById('capture-lightbox-label');
  if (!lb || !img) return;
  img.src = src;
  if (lbl) lbl.textContent = label || '';
  lb.classList.add('open');
}
function closeLightbox() {
  const lb = document.getElementById('capture-lightbox');
  if (lb) lb.classList.remove('open');
}

/* ── Boot on DOM ready ── */
document.addEventListener('DOMContentLoaded', () => {
  const name = sessionStorage.getItem('pymetric_name');
  if (!name) {
    window.location.href = 'index.html';
    return;
  }

  /* ── Arcade splash / INSERT COIN sequence ── */
  const splash   = document.getElementById('arcade-splash');
  const nameEl   = document.getElementById('splash-player-name');
  const insertEl = document.getElementById('spl-insert-coin');
  const slotEl   = document.getElementById('spl-slot-body');
  const coinEl   = document.getElementById('spl-coin-drop');

  if (nameEl) nameEl.textContent = name.toUpperCase();

  let splashUsed = false;

  function insertCoin() {
    if (splashUsed) return;
    splashUsed = true;

    // Sound
    window.PymetricSounds && window.PymetricSounds.sfxClick && window.PymetricSounds.sfxClick();

    // Slot lights up
    if (slotEl) slotEl.classList.add('active');

    // Coin falls
    if (coinEl) coinEl.classList.add('go');

    // Swap INSERT COIN text → STARTING
    if (insertEl) {
      insertEl.classList.add('locked');
      insertEl.textContent = '✦ STARTING... ✦';
    }

    // Flash the screen
    if (splash) splash.classList.add('flash');

    // After coin lands → slide screen up and boot
    setTimeout(() => {
      if (splash) splash.classList.add('exiting');
      setTimeout(() => {
        if (splash) splash.style.display = 'none';
        window.PymetricApp.boot();
      }, 500);
    }, 650);
  }

  if (splash) {
    splash.addEventListener('click', insertCoin);
    document.addEventListener('keydown', insertCoin, { once: true });
  } else {
    window.PymetricApp.boot();
  }
});
