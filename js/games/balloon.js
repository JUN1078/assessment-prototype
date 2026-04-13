/**
 * PYMETRIC ARCADE — Game 1: Balloon Game (BART)
 *
 * Measures: Risk-taking, Decision-making
 * Based on: Balloon Analogue Risk Task (BART)
 *
 * 3 Balloons:
 *  - Orange: explodes at random pump 1–8   (mean=4)
 *  - Yellow: explodes at random pump 1–32  (mean=16)
 *  - Blue:   explodes at random pump 1–128 (mean=64) ← main scoring
 */

window.BalloonGame = (function () {
  'use strict';

  const REWARD_PER_PUMP = 500; // Rp 500 per pump

  const BALLOONS = [
    { color: '#ff8c40', darkColor: '#e07830', name: 'ORANYE', maxExplode: 8,   label: 'ORANGE' },
    { color: '#ffd700', darkColor: '#ccaa00', name: 'KUNING', maxExplode: 32,  label: 'YELLOW' },
    { color: '#4a6cc0', darkColor: '#2840a0', name: 'BIRU',   maxExplode: 128, label: 'BLUE'   }
  ];

  let currentBalloon = 0;
  let pumps = 0;
  let explodeAt = 0;
  let roundMoney = 0;
  let totalSaved = 0;
  let gameActive = false;
  let startTime = 0;
  let firstPumpTime = null;

  // Detailed metrics per balloon
  const metrics = {
    balloons: [],   // per-balloon data
    totalPumpsAll: 0,
    totalSavedMoney: 0,
    bluePumps: 0,   // key scoring variable
    blueExploded: false,
    blueExplodeAt: 0
  };

  function getRandExplodeAt(max) {
    return Math.floor(Math.random() * max) + 1;
  }

  function init() {
    currentBalloon = 0;
    pumps = 0;
    roundMoney = 0;
    totalSaved = 0;
    gameActive = true;
    startTime = Date.now();
    firstPumpTime = null;
    metrics.balloons = [];
    metrics.totalPumpsAll = 0;
    metrics.totalSavedMoney = 0;
    metrics.bluePumps = 0;
    metrics.blueExploded = false;
    metrics.blueExplodeAt = 0;

    setupRound();
    updateUI();
  }

  function setupRound() {
    const bal = BALLOONS[currentBalloon];
    pumps = 0;
    roundMoney = 0;
    explodeAt = getRandExplodeAt(bal.maxExplode);
    firstPumpTime = null;

    // Update balloon color
    const body = document.getElementById('balloon-body');
    if (body) {
      body.setAttribute('fill', bal.color);
      // Reset balloon size
      body.setAttribute('rx', '60');
      body.setAttribute('ry', '70');
      body.setAttribute('cx', '80');
      body.setAttribute('cy', '90');
    }
    clearExplosion();
    setFeedback(`BALLOON ${currentBalloon + 1}/3 — ${bal.label}`, 'color:var(--gba-text)');
    document.getElementById('btnPump').disabled = false;
    document.getElementById('btnSave').disabled = false;
    updateUI();
  }

  const sfx = (n) => { window.PymetricSounds && window.PymetricSounds[n] && window.PymetricSounds[n](); };

  function pump() {
    if (!gameActive) return;
    if (!firstPumpTime) firstPumpTime = Date.now();
    sfx('sfxPump');

    pumps++;
    roundMoney += REWARD_PER_PUMP;

    // Scale balloon
    const scale = 1 + (pumps / BALLOONS[currentBalloon].maxExplode) * 0.8;
    const body = document.getElementById('balloon-body');
    if (body) {
      const rx = Math.min(60 * scale, 95);
      const ry = Math.min(70 * scale, 110);
      const cy = Math.max(90 - (scale - 1) * 30, 70);
      body.setAttribute('rx', rx);
      body.setAttribute('ry', ry);
      body.setAttribute('cy', cy);
    }

    // Flash earn indicator
    spawnCoin('+Rp 500');
    updateUI();

    // Check explosion
    if (pumps >= explodeAt) {
      explode();
      return;
    }

    setFeedback(`PUMPED ${pumps}x — Rp ${roundMoney.toLocaleString('id-ID')} AT RISK`, '');
  }

  function save() {
    if (!gameActive || pumps === 0) return;
    sfx('sfxSave');
    const saved = roundMoney;
    totalSaved += saved;
    metrics.totalSavedMoney += saved;

    // Record balloon data
    recordBalloonData(false, saved);

    // If blue balloon, record key metrics
    if (currentBalloon === 2) {
      metrics.bluePumps    = pumps;
      metrics.blueExploded = false;
      metrics.blueExplodeAt = explodeAt;
    }

    setFeedback(`✓ SAVED Rp ${saved.toLocaleString('id-ID')}!`, 'color:var(--gba-green)');
    advanceBalloon();
  }

  function explode() {
    gameActive = false;
    sfx('sfxPop');
    document.getElementById('btnPump').disabled = true;
    document.getElementById('btnSave').disabled = true;

    // Show explosion
    const body = document.getElementById('balloon-body');
    if (body) body.style.display = 'none';

    const expArea = document.getElementById('balloon-explosion-area');
    if (expArea) {
      expArea.innerHTML = '<div class="balloon-explosion">💥</div>';
    }

    // Record balloon data (exploded)
    recordBalloonData(true, 0);

    if (currentBalloon === 2) {
      metrics.bluePumps    = pumps;
      metrics.blueExploded = true;
      metrics.blueExplodeAt = explodeAt;
    }

    const roundLoss = roundMoney;
    roundMoney = 0;
    updateUI();
    setFeedback(`💥 BALLOON EXPLODED! LOST Rp ${roundLoss.toLocaleString('id-ID')}`, 'color:var(--gba-red)');

    setTimeout(() => {
      clearExplosion();
      const bodyEl = document.getElementById('balloon-body');
      if (bodyEl) bodyEl.style.display = '';
      advanceBalloon();
    }, 1800);
  }

  function advanceBalloon() {
    currentBalloon++;
    metrics.totalPumpsAll += pumps;

    if (currentBalloon >= BALLOONS.length) {
      finishGame();
      return;
    }
    gameActive = true;
    setupRound();
  }

  function finishGame() {
    gameActive = false;
    if (window.PymetricApp) window.PymetricApp.gameFinished(1, getResults());
  }

  function recordBalloonData(exploded, savedAmount) {
    const bal = BALLOONS[currentBalloon];
    metrics.balloons.push({
      balloonIndex:  currentBalloon,
      balloonLabel:  bal.label,
      maxExplode:    bal.maxExplode,
      explodeAt,
      pumps,
      exploded,
      savedAmount,
      firstPumpLatency: firstPumpTime ? firstPumpTime - startTime : null,
      timestamp: Date.now()
    });
  }

  function clearExplosion() {
    const expArea = document.getElementById('balloon-explosion-area');
    if (expArea) expArea.innerHTML = '';
  }

  function updateUI() {
    const roundEl = document.getElementById('bal-round');
    const roundMoneyEl = document.getElementById('bal-round-money');
    const totalEl = document.getElementById('bal-total-money');

    if (roundEl) roundEl.textContent = `${Math.min(currentBalloon + 1, 3)} / 3`;
    if (roundMoneyEl) roundMoneyEl.textContent = `Rp ${roundMoney.toLocaleString('id-ID')}`;
    if (totalEl) totalEl.textContent = `Rp ${totalSaved.toLocaleString('id-ID')}`;
  }

  function setFeedback(msg, style) {
    const el = document.getElementById('bal-feedback');
    if (!el) return;
    el.innerHTML = msg;
    el.style.cssText = style || '';
  }

  function spawnCoin(text) {
    const area = document.getElementById('balloon-area');
    if (!area) return;
    const coin = document.createElement('div');
    coin.className = 'float-coin';
    coin.textContent = text;
    coin.style.left = `${40 + Math.random() * 20}%`;
    coin.style.top  = `${30 + Math.random() * 20}%`;
    area.appendChild(coin);
    setTimeout(() => coin.remove(), 1000);
  }

  /* ── Scoring ── */
  function getResults() {
    const blueBal = metrics.balloons.find(b => b.balloonLabel === 'BLUE');
    const nonExplodedBalloons = metrics.balloons.filter(b => !b.exploded);
    const avgPumpsNonExploded = nonExplodedBalloons.length
      ? nonExplodedBalloons.reduce((s, b) => s + b.pumps, 0) / nonExplodedBalloons.length
      : 0;

    // Risk score: 0–100 based on blue balloon pumps (0 pumps = 0, 128 pumps = 100)
    const bluePumps = blueBal ? blueBal.pumps : 0;
    const riskScore = Math.round((bluePumps / 128) * 100);

    // Risk category
    let riskCategory;
    if (riskScore <= 20)       riskCategory = 'SANGAT RENDAH';
    else if (riskScore <= 40)  riskCategory = 'RENDAH';
    else if (riskScore <= 60)  riskCategory = 'SEDANG';
    else if (riskScore <= 80)  riskCategory = 'TINGGI';
    else                        riskCategory = 'SANGAT TINGGI';

    return {
      game: 'BALLOON',
      gameName: 'Balloon Game',
      totalSaved,
      totalPumps: metrics.totalPumpsAll,
      avgPumpsNonExploded: Math.round(avgPumpsNonExploded * 10) / 10,
      balloonDetails: metrics.balloons,
      bluePumps,
      blueExploded: blueBal ? blueBal.exploded : null,
      riskScore,
      riskCategory,
      primary: {
        label: 'Risk-Taking Score (Blue Balloon)',
        value: `${riskScore}/100 — ${riskCategory}`,
        raw: riskScore
      },
      secondary: {
        totalSavedRp:       totalSaved,
        avgPumpsNoExplode:  Math.round(avgPumpsNonExploded * 10) / 10,
        explodedCount:      metrics.balloons.filter(b => b.exploded).length,
        bluePumpCount:      bluePumps
      }
    };
  }

  return { init, pump, save, getResults };
})();

/* Global wrappers for HTML onclick */
function balloonPump() { window.BalloonGame && window.BalloonGame.pump(); }
function balloonSave() { window.BalloonGame && window.BalloonGame.save(); }
