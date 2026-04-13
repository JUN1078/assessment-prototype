/**
 * PYMETRIC ARCADE — Browser-Based AI Proctoring System
 *
 * Detects:
 *   1. Tab switching / window blur (Visibility API)
 *   2. Fullscreen exit attempts
 *   3. New-tab keyboard shortcuts (Ctrl+T, Ctrl+N, etc.)
 *   4. Right-click / context menu
 *   5. Copy-paste attempts
 *   6. DevTools open detection
 *   7. Face presence via webcam (MediaPipe/face-api lightweight check)
 *   8. Multiple faces detected
 *   9. Window focus loss
 */

window.PymetricProctor = (function () {
  'use strict';

  /* ── State ── */
  const state = {
    active: false,
    violations: [],
    warningCount: 0,
    maxWarnings: 5,
    tabSwitchCount: 0,
    faceWarnings: 0,
    lastFaceDetected: true,
    devToolsOpen: false,
    cameraStream: null,
    screenStream: null,      // getDisplayMedia stream
    captureInterval: null,   // periodic screenshot interval
    captures: [],            // [{timestamp, elapsed, camera, screen}]
    multipleScreens: false,
    faceCheckInterval: null,
    devToolsCheckInterval: null,
    sessionStart: Date.now(),
    callbacks: {
      onViolation: null,
      onWarning: null,
      onCritical: null
    }
  };

  /* ── Violation log ── */
  function logViolation(type, detail = '') {
    const entry = {
      type,
      detail,
      timestamp: Date.now(),
      elapsed: Math.round((Date.now() - state.sessionStart) / 1000)
    };
    state.violations.push(entry);
    state.warningCount++;
    updateWarningUI();

    if (state.callbacks.onViolation) state.callbacks.onViolation(entry);

    // Show glitch effect on violation
    if (window.PowerGlitch) {
      try {
        PowerGlitch.glitch('body', {
          playMode: 'click',
          timing: { duration: 400, iterations: 1 },
          glitchTimeSpan: { start: 0, end: 1 },
          shake: { velocity: 30, amplitudeX: 0.3, amplitudeY: 0.1 },
          slice: { count: 10, velocity: 25, minHeight: 0.05, maxHeight: 0.2, hueRotate: true }
        });
      } catch (e) { /* ignore */ }
    }

    if (state.warningCount >= state.maxWarnings) {
      showCriticalOverlay(type);
    } else {
      showWarningBanner(type, detail);
    }
    return entry;
  }

  /* ── UI helpers ── */
  function updateWarningUI() {
    const el = document.getElementById('warn-counter');
    const ssWarn = document.getElementById('ss-warnings');
    if (el) {
      el.textContent = `⚠ WARNINGS: ${state.warningCount}`;
      if (state.warningCount > 0) el.classList.add('anim-pulse');
    }
    if (ssWarn) ssWarn.textContent = state.warningCount;
  }

  function showWarningBanner(type, _detail) {
    const banner = document.getElementById('proctor-warn-banner');
    if (!banner) return;
    const msgs = {
      TAB_SWITCH:    '⚠ TAB SWITCH DETECTED — RETURN TO ASSESSMENT',
      WINDOW_BLUR:   '⚠ WINDOW FOCUS LOST — STAY ON THIS PAGE',
      FULLSCREEN:    '⚠ FULLSCREEN EXITED — PLEASE RE-ENTER FULLSCREEN',
      SHORTCUT:      '⚠ FORBIDDEN SHORTCUT BLOCKED',
      CONTEXT_MENU:  '⚠ RIGHT-CLICK IS DISABLED DURING ASSESSMENT',
      COPY_PASTE:    '⚠ COPY/PASTE IS DISABLED DURING ASSESSMENT',
      DEV_TOOLS:     '⚠ DEVELOPER TOOLS DETECTED — CLOSE THEM',
      NO_FACE:       '⚠ FACE NOT DETECTED — PLEASE SIT IN FRONT OF THE CAMERA',
      MULTI_FACE:    '⚠ TWO OR MORE PEOPLE DETECTED — SOLO SESSION ONLY',
      NOT_FOCUSED:         '⚠ NOT FOCUSED — PLEASE LOOK AT THE SCREEN',
      DUAL_SCREEN:         '⚠ SECOND MONITOR DETECTED — USE ONE SCREEN ONLY',
      SCREEN_SHARE_STOPPED:'⚠ SCREEN SHARE STOPPED — SESSION FLAGGED'
    };
    banner.textContent = msgs[type] || `⚠ VIOLATION: ${type}`;
    banner.style.display = 'block';
    clearTimeout(banner._timeout);
    banner._timeout = setTimeout(() => { banner.style.display = 'none'; }, 4000);
  }

  function showCriticalOverlay(type) {
    const overlay = document.getElementById('proctor-overlay');
    const msg = document.getElementById('proctor-overlay-msg');
    if (!overlay) return;
    if (msg) msg.textContent = `${type.replace(/_/g, ' ')} — ${state.warningCount} VIOLATIONS RECORDED`;
    overlay.style.display = 'flex';

    // Auto-dismiss after 5s (session flagged but can continue)
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 5000);
  }

  /* ── 1. Tab visibility / Page Visibility API ── */
  function setupTabDetection() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && state.active) {
        state.tabSwitchCount++;
        logViolation('TAB_SWITCH', `Tab switch #${state.tabSwitchCount}`);
      }
    });
  }

  /* ── 2. Window focus/blur ── */
  function setupFocusDetection() {
    window.addEventListener('blur', () => {
      if (state.active) logViolation('WINDOW_BLUR', 'Window focus lost');
    });
  }

  /* ── 3. Keyboard shortcuts (new tab, new window, etc.) ── */
  const BLOCKED_SHORTCUTS = [
    { key: 't', ctrl: true, label: 'Ctrl+T (new tab)' },
    { key: 'n', ctrl: true, label: 'Ctrl+N (new window)' },
    { key: 'w', ctrl: true, label: 'Ctrl+W (close tab)' },
    { key: 'Tab', ctrl: true, label: 'Ctrl+Tab (switch tab)' },
    { key: 'F12', label: 'F12 (devtools)' },
    { key: 'I', ctrl: true, shift: true, label: 'Ctrl+Shift+I (devtools)' },
    { key: 'J', ctrl: true, shift: true, label: 'Ctrl+Shift+J (devtools)' },
    { key: 'U', ctrl: true, label: 'Ctrl+U (view source)' },
    { key: 'P', ctrl: true, shift: true, label: 'Ctrl+Shift+P (print)' },
    { key: 's', ctrl: true, label: 'Ctrl+S (save)' },
    { key: 'a', ctrl: true, label: 'Ctrl+A (select all)' },
    { key: 'c', ctrl: true, label: 'Ctrl+C (copy)' },
    { key: 'v', ctrl: true, label: 'Ctrl+V (paste)' }
  ];

  function setupKeyboardBlocking() {
    document.addEventListener('keydown', (e) => {
      if (!state.active) return;

      for (const shortcut of BLOCKED_SHORTCUTS) {
        const ctrlMatch  = shortcut.ctrl  ? (e.ctrlKey || e.metaKey) : true;
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey || !shortcut.shift;
        const keyMatch   = e.key === shortcut.key || e.code === shortcut.key;

        if (keyMatch && ctrlMatch && (shortcut.shift === undefined || shiftMatch)) {
          if (shortcut.ctrl || shortcut.key === 'F12') {
            e.preventDefault();
            e.stopPropagation();
            logViolation('SHORTCUT', shortcut.label);
            return false;
          }
        }
      }

      // Alt+Tab / Alt+F4
      if (e.altKey && (e.key === 'Tab' || e.key === 'F4')) {
        e.preventDefault();
        logViolation('SHORTCUT', `Alt+${e.key}`);
      }
    }, true);
  }

  /* ── 4. Right-click block ── */
  function setupContextMenuBlock() {
    document.addEventListener('contextmenu', (e) => {
      if (!state.active) return;
      e.preventDefault();
      logViolation('CONTEXT_MENU', 'Right-click attempted');
    });
  }

  /* ── 5. Copy/paste block ── */
  function setupClipboardBlock() {
    ['copy', 'cut', 'paste'].forEach(evt => {
      document.addEventListener(evt, (e) => {
        if (!state.active) return;
        e.preventDefault();
        logViolation('COPY_PASTE', `${evt} attempted`);
      });
    });
  }

  /* ── 6. DevTools detection ── */
  function setupDevToolsDetection() {
    state.devToolsCheckInterval = setInterval(() => {
      if (!state.active) return;
      const widthDiff  = window.outerWidth  - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;

      // DevTools typically add >100px difference
      const devOpen = widthDiff > 160 || heightDiff > 160;
      if (devOpen && !state.devToolsOpen) {
        state.devToolsOpen = true;
        logViolation('DEV_TOOLS', `Dev tools opened (diff: ${widthDiff}x${heightDiff})`);
      } else if (!devOpen) {
        state.devToolsOpen = false;
      }
    }, 2000);
  }

  /* ── 7. Fullscreen enforcement ── */
  function requestFullscreen() {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (el.mozRequestFullScreen) el.mozRequestFullScreen();
  }

  function setupFullscreenDetection() {
    const onFsChange = () => {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (!fsEl && state.active) {
        logViolation('FULLSCREEN', 'Fullscreen exited');
        // Attempt to re-enter
        setTimeout(requestFullscreen, 1500);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
  }

  /* ── 8. Webcam / face detection ── */
  async function setupCamera() {
    const camWrap  = document.getElementById('proctor-cam-wrap');
    const video    = document.getElementById('proctor-video');
    const statusEl = document.getElementById('proctor-status');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
        audio: false
      });
      state.cameraStream = stream;
      if (video) {
        video.srcObject = stream;
        video.play().catch(() => {});
      }
      if (camWrap) camWrap.style.display = 'block';
      if (statusEl) statusEl.textContent = 'CAM: ACTIVE ✓';

      // Start lightweight face presence check via canvas + color analysis
      startFaceCheck(video, statusEl);
      return true;
    } catch (err) {
      if (statusEl) statusEl.textContent = 'CAM: NO ACCESS';
      if (statusEl) statusEl.style.borderColor = 'var(--gba-red)';
      if (statusEl) statusEl.style.color = 'var(--gba-red)';
      logViolation('CAMERA', `Camera access denied: ${err.message}`);
      return false;
    }
  }

  /**
   * Face analysis using canvas pixel data.
   * Detects:
   *   - No face present (user left)
   *   - Multiple people (2+ separate face-sized skin clusters)
   *   - Not focused (face centroid far from frame center)
   */
  function startFaceCheck(video, statusEl) {
    const W = 160, H = 120;       // analysis resolution
    const GRID_COLS = 8, GRID_ROWS = 6;
    const CELL_W = W / GRID_COLS, CELL_H = H / GRID_ROWS;
    const FACE_MIN_RATIO  = 0.04; // <4% skin → no face
    const CENTER_MARGIN   = 0.35; // centroid must be within 35% of center
    const CHECK_INTERVAL  = 2500; // ms between checks
    const STREAK_NEEDED   = 3;    // consecutive checks before flagging

    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    // Streak counters per violation type
    let streaks = { NO_FACE: 0, NOT_FOCUSED: 0, MULTI_FACE: 0 };
    // Suppress re-flag until user recovers
    let flagged  = { NO_FACE: false, NOT_FOCUSED: false, MULTI_FACE: false };

    function isSkin(r, g, b) {
      // Broad skin-tone range covering light to dark complexions (YCbCr-like heuristic)
      return (
        r > 60 && g > 30 && b > 15 &&
        r > g  && r > b  &&
        (r - Math.min(g, b)) > 10 &&
        r - g < 120 &&          // not too saturated red
        Math.abs(r - g) > 5
      );
    }

    /**
     * Build a grid of skin-cell flags, then label connected skin-cell regions.
     * Returns number of distinct regions large enough to be a face.
     */
    function countFaceRegions(skinGrid) {
      const visited = Array.from({ length: GRID_ROWS }, () => new Array(GRID_COLS).fill(false));
      let regions = 0;
      const MIN_CELLS_FOR_FACE = 3; // at least 3 connected cells = face-sized blob

      function bfs(startR, startC) {
        const queue = [[startR, startC]];
        visited[startR][startC] = true;
        let size = 0;
        while (queue.length) {
          const [r, c] = queue.shift();
          size++;
          for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < GRID_ROWS && nc >= 0 && nc < GRID_COLS &&
                !visited[nr][nc] && skinGrid[nr][nc]) {
              visited[nr][nc] = true;
              queue.push([nr, nc]);
            }
          }
        }
        return size;
      }

      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          if (skinGrid[r][c] && !visited[r][c]) {
            const size = bfs(r, c);
            if (size >= MIN_CELLS_FOR_FACE) regions++;
          }
        }
      }
      return regions;
    }

    state.faceCheckInterval = setInterval(() => {
      if (!state.active || !video || video.readyState < 2) return;
      try {
        ctx.drawImage(video, 0, 0, W, H);
        const data = ctx.getImageData(0, 0, W, H).data;

        // ── Pixel-level skin detection + centroid ──
        let totalSkin = 0;
        let sumX = 0, sumY = 0;
        const skinGrid = Array.from({ length: GRID_ROWS }, () => new Array(GRID_COLS).fill(false));
        const cellSkin = Array.from({ length: GRID_ROWS }, () => new Array(GRID_COLS).fill(0));

        for (let py = 0; py < H; py++) {
          for (let px = 0; px < W; px++) {
            const idx = (py * W + px) * 4;
            if (isSkin(data[idx], data[idx+1], data[idx+2])) {
              totalSkin++;
              sumX += px; sumY += py;
              const gr = Math.floor(py / CELL_H);
              const gc = Math.floor(px / CELL_W);
              cellSkin[gr][gc]++;
            }
          }
        }

        const totalPixels  = W * H;
        const skinRatio    = totalSkin / totalPixels;

        // Mark grid cells that have enough skin
        const CELL_SKIN_THRESHOLD = CELL_W * CELL_H * 0.12; // 12% of cell
        for (let r = 0; r < GRID_ROWS; r++) {
          for (let c = 0; c < GRID_COLS; c++) {
            skinGrid[r][c] = cellSkin[r][c] >= CELL_SKIN_THRESHOLD;
          }
        }

        // ── 1. NO FACE ──
        const facePresent = skinRatio >= FACE_MIN_RATIO;
        if (!facePresent) {
          streaks.NO_FACE++;
          streaks.NOT_FOCUSED = 0;
          streaks.MULTI_FACE  = 0;
          if (streaks.NO_FACE >= STREAK_NEEDED && !flagged.NO_FACE) {
            flagged.NO_FACE = true;
            state.faceWarnings++;
            logViolation('NO_FACE', `No face detected (skin: ${(skinRatio*100).toFixed(1)}%)`);
            if (statusEl) { statusEl.textContent = 'CAM: NO FACE ⚠'; statusEl.style.color = 'var(--gba-red)'; }
          }
          return;
        }

        // Face is present — reset no-face
        streaks.NO_FACE = 0;
        if (flagged.NO_FACE) {
          flagged.NO_FACE = false;
          if (statusEl) { statusEl.style.color = 'var(--gba-green)'; }
        }

        // ── 2. MULTIPLE PEOPLE ──
        const faceRegions = countFaceRegions(skinGrid);
        if (faceRegions >= 2) {
          streaks.MULTI_FACE++;
          if (streaks.MULTI_FACE >= STREAK_NEEDED && !flagged.MULTI_FACE) {
            flagged.MULTI_FACE = true;
            state.faceWarnings++;
            logViolation('MULTI_FACE', `${faceRegions} people detected in frame`);
            if (statusEl) { statusEl.textContent = 'CAM: 2+ PEOPLE ⚠'; statusEl.style.color = 'var(--gba-red)'; }
          }
        } else {
          streaks.MULTI_FACE = 0;
          flagged.MULTI_FACE = false;
        }

        // ── 3. NOT FOCUSED (face centroid off-center) ──
        const centroidX = sumX / totalSkin / W;  // 0–1
        const centroidY = sumY / totalSkin / H;  // 0–1
        const offCenterX = Math.abs(centroidX - 0.5);
        const offCenterY = Math.abs(centroidY - 0.5);
        const notFocused = offCenterX > CENTER_MARGIN || offCenterY > CENTER_MARGIN;

        if (notFocused) {
          streaks.NOT_FOCUSED++;
          if (streaks.NOT_FOCUSED >= STREAK_NEEDED && !flagged.NOT_FOCUSED) {
            flagged.NOT_FOCUSED = true;
            state.faceWarnings++;
            const dir = offCenterX > offCenterY
              ? (centroidX < 0.5 ? 'looking LEFT' : 'looking RIGHT')
              : (centroidY < 0.5 ? 'looking UP'   : 'looking DOWN');
            logViolation('NOT_FOCUSED', `Face off-center: ${dir} (cx:${centroidX.toFixed(2)}, cy:${centroidY.toFixed(2)})`);
            if (statusEl) { statusEl.textContent = 'CAM: NOT FOCUSED ⚠'; statusEl.style.color = 'var(--gba-gold)'; }
          }
        } else {
          streaks.NOT_FOCUSED = 0;
          if (flagged.NOT_FOCUSED) {
            flagged.NOT_FOCUSED = false;
            if (statusEl) { statusEl.style.color = 'var(--gba-green)'; }
          }
          // All OK
          const regionLabel = faceRegions >= 2 ? `${faceRegions} FACES ⚠` : 'FACE OK ✓';
          if (statusEl) statusEl.textContent = `CAM: ${regionLabel}`;
          if (!flagged.MULTI_FACE && statusEl) statusEl.style.color = 'var(--gba-green)';
        }

      } catch (e) { /* canvas tainted or video not ready */ }
    }, CHECK_INTERVAL);
  }

  /* ── 9. Prevent window.open (new tab from JS) ── */
  function blockWindowOpen() {
    window.open = function () {
      logViolation('SHORTCUT', 'window.open() called — blocked');
      return null;
    };
  }

  /* ── 10. Dual monitor / second screen detection ── */
  async function detectSecondScreen() {
    // Method 1: Screen.isExtended (Chrome 100+, no permission needed)
    if ('isExtended' in window.screen) {
      return window.screen.isExtended;
    }
    // Method 2: Window Management API (requires permission prompt)
    if ('getScreenDetails' in window) {
      try {
        const details = await window.getScreenDetails();
        return details.screens.length > 1;
      } catch (_) { /* permission denied — treat as unknown */ }
    }
    // Heuristic fallback: screen width unusually large
    return window.screen.width > 3000;
  }

  async function checkAndEnforceOneScreen() {
    const hasExtra = await detectSecondScreen();
    if (hasExtra) {
      state.multipleScreens = true;
      logViolation('DUAL_SCREEN', 'Second monitor detected');
      showWarningBanner('DUAL_SCREEN', '');
    }
    // Poll every 10s for connect/disconnect
    setInterval(async () => {
      if (!state.active) return;
      const extra = await detectSecondScreen();
      if (extra && !state.multipleScreens) {
        state.multipleScreens = true;
        logViolation('DUAL_SCREEN', 'Second monitor connected during session');
      } else if (!extra) {
        state.multipleScreens = false;
      }
    }, 10000);
  }

  /* ── 11. Screen sharing (getDisplayMedia) ── */
  async function requestScreenShare() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'monitor', width: 1280, height: 720 },
        audio: false
      });
      state.screenStream = stream;

      // Hidden video element to draw from
      if (!document.getElementById('_proctor_screen_video')) {
        const sv = document.createElement('video');
        sv.id = '_proctor_screen_video';
        sv.style.display = 'none';
        sv.muted = true; sv.autoplay = true;
        document.body.appendChild(sv);
      }
      document.getElementById('_proctor_screen_video').srcObject = stream;

      // Flag if user stops sharing
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        state.screenStream = null;
        if (state.active) logViolation('SCREEN_SHARE_STOPPED', 'Screen share was stopped by user');
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ── 12. Periodic capture: camera + screen every 5 minutes ── */
  function startPeriodicCaptures() {
    const INTERVAL = 5 * 60 * 1000; // 5 minutes

    async function doCapture() {
      if (!state.active) return;
      const entry = {
        timestamp: Date.now(),
        elapsed:   Math.round((Date.now() - state.sessionStart) / 1000),
        camera:    null,
        screen:    null
      };

      // Camera frame
      const camVideo = document.getElementById('proctor-video');
      if (camVideo && camVideo.readyState >= 2) {
        const cc = document.createElement('canvas');
        cc.width = 320; cc.height = 240;
        cc.getContext('2d').drawImage(camVideo, 0, 0, 320, 240);
        entry.camera = cc.toDataURL('image/jpeg', 0.6);
      }

      // Screen frame
      const sv = document.getElementById('_proctor_screen_video');
      if (sv && state.screenStream && sv.readyState >= 2) {
        const sc = document.createElement('canvas');
        sc.width = 640; sc.height = 360;
        sc.getContext('2d').drawImage(sv, 0, 0, 640, 360);
        entry.screen = sc.toDataURL('image/jpeg', 0.5);
      }

      state.captures.push(entry);
    }

    // Also capture immediately (t=0)
    setTimeout(doCapture, 3000);
    state.captureInterval = setInterval(doCapture, INTERVAL);
  }

  /* ── Network speed measurement — streaming, no navigator.connection.downlink ── */
  async function measureNetworkSpeed(onProgress) {
    if (!navigator.onLine) return { ok: false, mbps: 0, latencyMs: null, msg: 'OFFLINE' };

    // Latency: time to first byte
    let latencyMs = null;
    try {
      const lt0 = performance.now();
      await fetch('https://speed.cloudflare.com/cdn-cgi/trace?' + Date.now(),
        { cache: 'no-store', mode: 'no-cors' });
      latencyMs = Math.round(performance.now() - lt0);
    } catch (_) {}

    // Streaming download — try URLs in order
    const TEST_URLS = [
      'https://speed.cloudflare.com/__down?bytes=2097152', // 2 MB
      'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', // ~600 KB
      'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js'  // ~89 KB
    ];

    for (const url of TEST_URLS) {
      try {
        const sep = url.includes('?') ? '&' : '?';
        const controller = new AbortController();
        const abort = setTimeout(() => controller.abort(), 9000);
        const t0 = performance.now();
        const res = await fetch(url + sep + 'nc=' + Date.now(), {
          cache: 'no-store', signal: controller.signal
        });
        if (!res.ok || !res.body) { clearTimeout(abort); continue; }

        const reader = res.body.getReader();
        let loaded = 0;
        let lastReport = t0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          loaded += value ? value.length : 0;

          const now = performance.now();
          if (now - lastReport > 220 && loaded > 0) {
            const elapsed = (now - t0) / 1000;
            if (elapsed > 0.05) {
              const live = Math.round((loaded * 8) / elapsed / 1_000_000 * 10) / 10;
              if (onProgress) onProgress(live);
              lastReport = now;
            }
          }
        }
        clearTimeout(abort);

        const totalSecs = (performance.now() - t0) / 1000;
        if (totalSecs < 0.004 || loaded < 1000) continue;

        const mbps = Math.round((loaded * 8) / totalSecs / 1_000_000 * 10) / 10;
        if (onProgress) onProgress(mbps);
        return { ok: mbps >= 5, mbps, latencyMs, msg: `${mbps} Mbps` };
      } catch (_) { /* try next URL */ }
    }
    return { ok: true, mbps: null, latencyMs, msg: 'CONNECTED (SPEED N/A)' };
  }

  /* ── Device / browser detection ── */
  function detectDevice() {
    const ua = navigator.userAgent;

    // Browser (Edge must be checked before Chrome)
    let browser = 'Unknown', browserVersion = 0;
    const edgeM   = ua.match(/Edg\/(\d+)/);
    const chromeM = ua.match(/Chrome\/(\d+)/);
    if (edgeM)        { browser = 'Microsoft Edge'; browserVersion = parseInt(edgeM[1]); }
    else if (chromeM) { browser = 'Google Chrome';  browserVersion = parseInt(chromeM[1]); }
    else if (/Firefox/i.test(ua)) {
      browser = 'Firefox';
      const m = ua.match(/Firefox\/(\d+)/); browserVersion = m ? parseInt(m[1]) : 0;
    } else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) { browser = 'Safari'; }

    // Allowed: Chrome or Edge version ≥ 110 (approx. 2 major versions back from 2024)
    const browserOk = (browser === 'Google Chrome' || browser === 'Microsoft Edge')
                      && browserVersion >= 110;

    // OS
    let os = 'Unknown';
    if (/Windows NT 1[01]\./.test(ua))  os = 'Windows 10 / 11';
    else if (/Windows/.test(ua))        os = 'Windows (older)';
    else if (/Mac OS X/.test(ua))       os = 'macOS';
    else if (/Android/.test(ua))        os = 'Android';
    else if (/iPhone|iPad/.test(ua))    os = 'iOS';
    else if (/Linux/.test(ua))          os = 'Linux';

    const isMobile  = /Mobi|Android|iPhone|iPad/i.test(ua);
    const deviceType = isMobile ? 'Mobile / Tablet' : 'Desktop';
    const deviceOk  = !isMobile;

    // Screen
    const sw = window.screen.width, sh = window.screen.height;
    const screenOk = sw >= 1280 && sh >= 720;

    // RAM (Chrome only, in GB)
    const ram   = navigator.deviceMemory || null;
    const ramOk = ram === null || ram >= 8;

    // CPU cores
    const cores  = navigator.hardwareConcurrency || null;
    const cpuOk  = cores === null || cores >= 4;

    // GPU via WebGL
    let gpu = 'Unknown';
    try {
      const c  = document.createElement('canvas');
      const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
                  : gl.getParameter(gl.RENDERER);
      }
    } catch (_) {}

    return {
      browser, browserVersion, browserOk,
      os, deviceType, deviceOk, isMobile,
      screen: `${sw} × ${sh}`, screenOk,
      ram:    ram   !== null ? `${ram} GB`  : 'Unknown', ramOk,
      cpuCores: cores || 'Unknown', cpuOk,
      gpu,
      allOk: browserOk && deviceOk && screenOk && cpuOk
    };
  }

  /* ── Microphone check ── */
  async function checkMicrophone() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

      // Analyse ambient level for 600 ms
      const audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
      const analyser  = audioCtx.createAnalyser();
      const src       = audioCtx.createMediaStreamSource(stream);
      src.connect(analyser);
      analyser.fftSize = 256;

      await new Promise(r => setTimeout(r, 600));

      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      const level = Math.round(data.reduce((s, v) => s + v, 0) / data.length);

      stream.getTracks().forEach(t => t.stop());
      audioCtx.close();

      const soundDetected = level > 8;
      return {
        ok: true, level, soundDetected,
        msg: soundDetected
          ? `MIC OK — AMBIENT SOUND DETECTED (${level})`
          : `MIC OK — QUIET (${level})`
      };
    } catch (e) {
      return { ok: false, level: 0, soundDetected: false, msg: 'MIC NOT AVAILABLE' };
    }
  }

  /* ── System pre-check ── */
  async function runSystemCheck(opts = {}) {
    const { onNetworkProgress } = opts;
    const results = {
      camera:      { ok: false, msg: '' },
      network:     { ok: false, msg: '', mbps: null, latencyMs: null },
      mic:         { ok: false, msg: '' },
      dualScreen:  { ok: true,  msg: '' },
      screenShare: { ok: false, msg: '' },
      device:      null
    };

    // 0. Device info (synchronous)
    results.device = detectDevice();

    // 1. Camera
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      s.getTracks().forEach(t => t.stop());
      results.camera = { ok: true, msg: 'Camera detected' };
    } catch (e) {
      results.camera = { ok: false, msg: 'Camera denied or unavailable' };
    }

    // 2. Network speed — streaming with live callback
    results.network = await measureNetworkSpeed(onNetworkProgress);

    // 3. Microphone
    results.mic = await checkMicrophone();

    // 4. Second screen
    const hasExtra = await detectSecondScreen();
    results.dualScreen = hasExtra
      ? { ok: false, msg: 'Second screen detected — disconnect it' }
      : { ok: true,  msg: 'Single screen confirmed' };

    // 5. Screen share (button — needs user gesture)
    results.screenShare = { ok: false, msg: 'Click button to share screen' };

    return results;
  }

  /* ── Initialize all detectors ── */
  async function init(callbacks = {}) {
    state.callbacks = { ...state.callbacks, ...callbacks };
    state.active = false;

    setupTabDetection();
    setupFocusDetection();
    setupKeyboardBlocking();
    setupContextMenuBlock();
    setupClipboardBlock();
    setupDevToolsDetection();
    setupFullscreenDetection();
    blockWindowOpen();
    await checkAndEnforceOneScreen();

    const camOk = await setupCamera();
    return camOk;
  }

  /* ── Activate proctoring ── */
  function activate() {
    state.active = true;
    requestFullscreen();
    startPeriodicCaptures();
  }

  /* ── Deactivate (end of session) ── */
  function deactivate() {
    state.active = false;
    if (state.faceCheckInterval)     clearInterval(state.faceCheckInterval);
    if (state.devToolsCheckInterval) clearInterval(state.devToolsCheckInterval);
    if (state.captureInterval)       clearInterval(state.captureInterval);
    if (state.cameraStream)  state.cameraStream.getTracks().forEach(t => t.stop());
    if (state.screenStream)  state.screenStream.getTracks().forEach(t => t.stop());
  }

  /* ── Export log ── */
  function getReport() {
    return {
      totalWarnings:   state.warningCount,
      tabSwitches:     state.tabSwitchCount,
      faceWarnings:    state.faceWarnings,
      multipleScreens: state.multipleScreens,
      captureCount:    state.captures.length,
      captures:        state.captures,
      violations:      state.violations,
      sessionDuration: Math.round((Date.now() - state.sessionStart) / 1000),
      integrityScore:  Math.max(0, 100 - state.warningCount * 10),
      device:          detectDevice()
    };
  }

  return { init, activate, deactivate, getReport, logViolation,
           requestFullscreen, requestScreenShare, runSystemCheck, detectDevice };
})();
