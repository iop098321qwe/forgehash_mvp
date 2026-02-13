(() => {
  'use strict';

  // ===== Constants and formulas (centralized) =====
  const FORMULAS = {
    baseHashRate: 0.1,
    hashDustToCash: 1,
    overclock: {
      maxMultiplier: 3,
      rampSeconds: 2,
      meterMaxSeconds: 8,
      drainRate: 1,
      rechargeRate: 1.5,
      rechargeDelaySeconds: 0.5
    },
    starting: {
      hashDust: 7,
      cash: 8,
      lifetimeCash: 0,
      blueprintPoints: 0,
      crashRemaining: 0,
      overclockMeter: 8,
      overclockRechargeRemaining: 0
    },
    crash: {
      threshold: 5,
      chancePerSecond: 0.02,
      pauseSeconds: 5,
      coolingReductionPerLevel: 0.1
    },
    hashFlow: {
      peakDecayPerSecond: 0.25,
      minPeak: 0.2
    },
    prestige: {
      bonusPerPoint: 0.05,
      pointsFromLifetimeCash: (lifetimeCash) => {
        return Math.floor(Math.sqrt(lifetimeCash / 1000));
      }
    },
    saveIntervalMs: 10000,
    maxLogEntries: 12,
    maxDeltaSeconds: 0.25
  };

  const SESSION_STATES = {
    READY: 'ready',
    RUNNING: 'running',
    PAUSED: 'paused',
    ENDED: 'ended'
  };

  // ===== Upgrade definitions (exactly 3) =====
  const UPGRADES = [
    {
      id: 'cpu',
      name: 'CPU Upgrade',
      baseCost: 15,
      costMultiplier: 1.15,
      hashPerLevel: 0.2,
      type: 'hash'
    },
    {
      id: 'gpu',
      name: 'GPU Upgrade',
      baseCost: 75,
      costMultiplier: 1.2,
      hashPerLevel: 1.0,
      type: 'hash'
    },
    {
      id: 'cooling',
      name: 'Cooling Upgrade',
      baseCost: 50,
      costMultiplier: 1.18,
      crashReductionPerLevel: 0.1,
      type: 'cooling'
    }
  ];

  // ===== Game state (single mutable object) =====
  const gameState = createDefaultGameState();

  // ===== UI references (not game state) =====
  const ui = {
    hashDustValue: document.getElementById('hashdust-value'),
    cashValue: document.getElementById('cash-value'),
    hashRateValue: document.getElementById('hashrate-value'),
    sessionStatus: document.getElementById('session-status'),
    miningStatus: document.getElementById('mining-status'),
    overclockStatus: document.getElementById('overclock-status'),
    startButton: document.getElementById('start-btn'),
    startScreen: document.getElementById('start-screen'),
    startMessage: document.getElementById('start-message'),
    gameShell: document.getElementById('game-shell'),
    pauseButton: document.getElementById('pause-btn'),
    sellButton: document.getElementById('sell-btn'),
    overclockButton: document.getElementById('overclock-btn'),
    overclockMeterFill: document.getElementById('overclock-meter-fill'),
    overclockMeterText: document.getElementById('overclock-meter-text'),
    overclockMultiplier: document.getElementById('overclock-multiplier'),
    reforgeButton: document.getElementById('reforge-btn'),
    blueprintPoints: document.getElementById('blueprint-points'),
    prestigeBonus: document.getElementById('prestige-bonus'),
    lifetimeCash: document.getElementById('lifetime-cash'),
    upgradesList: document.getElementById('upgrades-list'),
    logEntries: document.getElementById('log-entries'),
    pauseOverlay: document.getElementById('pause-overlay'),
    resumeButton: document.getElementById('resume-btn'),
    restartButton: document.getElementById('restart-btn'),
    endButton: document.getElementById('end-btn'),
    rigVisual: document.getElementById('rig-visual'),
    cpuIndicators: document.getElementById('cpu-indicators'),
    gpuIndicators: document.getElementById('gpu-indicators'),
    coolingIndicators: document.getElementById('cooling-indicators'),
    cpuOverflow: document.getElementById('cpu-overflow'),
    gpuOverflow: document.getElementById('gpu-overflow'),
    coolingOverflow: document.getElementById('cooling-overflow'),
    cpuLevel: document.getElementById('cpu-level'),
    gpuLevel: document.getElementById('gpu-level'),
    coolingLevel: document.getElementById('cooling-level'),
    powerStatus: document.getElementById('power-status'),
    hashflowFill: document.getElementById('hashflow-fill'),
    hashflowRate: document.getElementById('hashflow-rate'),
    hashflowLeds: document.getElementById('hashflow-leds'),
    upgradeRows: {}
  };

  // ===== Initialization =====
  initUI();
  initRigVisuals();
  loadGame();
  render();
  startMainLoop();
  setInterval(saveGame, FORMULAS.saveIntervalMs);
  window.addEventListener('beforeunload', saveGame);

  // ===== UI setup =====
function initUI() {
  ui.startButton.addEventListener('click', startGame);
  ui.pauseButton.addEventListener('click', togglePause);
  ui.sellButton.addEventListener('click', sellAllHashDust);
  ui.overclockButton.addEventListener('pointerdown', startOverclock);
  ui.overclockButton.addEventListener('pointerup', stopOverclock);
  ui.overclockButton.addEventListener('pointerleave', stopOverclock);
  ui.overclockButton.addEventListener('pointercancel', stopOverclock);
  ui.reforgeButton.addEventListener('click', reforge);
  ui.resumeButton.addEventListener('click', resumeGame);
  ui.restartButton.addEventListener('click', restartGame);
  ui.endButton.addEventListener('click', endGame);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('pointerup', stopOverclock);

  UPGRADES.forEach((upgrade) => {
      const row = document.createElement('div');
      row.className = 'upgrade-row';

      const info = document.createElement('div');
      info.className = 'upgrade-info';

      const name = document.createElement('div');
      name.textContent = upgrade.name;

      const details = document.createElement('div');
      details.className = 'muted';

      const levelSpan = document.createElement('span');
      const effectSpan = document.createElement('span');

      details.appendChild(document.createTextNode('Level: '));
      details.appendChild(levelSpan);
      details.appendChild(document.createTextNode(' | '));
      details.appendChild(effectSpan);

      const cost = document.createElement('div');
      cost.className = 'muted';
      const costSpan = document.createElement('span');
      cost.appendChild(document.createTextNode('Cost: '));
      cost.appendChild(costSpan);
      cost.appendChild(document.createTextNode(' Cash'));

      info.appendChild(name);
      info.appendChild(details);
      info.appendChild(cost);

      const button = document.createElement('button');
      button.textContent = 'Buy';
      button.addEventListener('click', () => buyUpgrade(upgrade.id));

      row.appendChild(info);
      row.appendChild(button);
      ui.upgradesList.appendChild(row);

      ui.upgradeRows[upgrade.id] = {
        levelSpan,
        effectSpan,
        costSpan,
        button
      };
  });
}

function initRigVisuals() {
  if (!ui.cpuIndicators || !ui.hashflowLeds) {
    return;
  }

  ui.rigSegments = {
    cpu: buildSegments(ui.cpuIndicators, 10, 'segment'),
    gpu: buildSegments(ui.gpuIndicators, 10, 'segment'),
    cooling: buildSegments(ui.coolingIndicators, 10, 'segment'),
    hashflow: buildSegments(ui.hashflowLeds, 10, 'hashflow-led')
  };
}

function buildSegments(container, count, className) {
  const segments = [];
  container.innerHTML = '';

  for (let i = 0; i < count; i += 1) {
    const segment = document.createElement('span');
    segment.className = className;
    container.appendChild(segment);
    segments.push(segment);
  }

  return segments;
}

  // ===== Game logic =====
  function update(deltaSeconds) {
    // Clamp large deltas so opening a hidden tab does not grant offline progress.
    const dt = Math.min(deltaSeconds, FORMULAS.maxDeltaSeconds);

    if (gameState.sessionState !== SESSION_STATES.RUNNING) {
      return;
    }

  updateTimers(dt);
  updateOverclock(dt);
  updateHashRatePeak(dt);
  processMining(dt);
  processCrashCheck(dt);
}

  // ===== Session control =====
  function startGame() {
    if (gameState.sessionState === SESSION_STATES.RUNNING) {
      return;
    }
    if (gameState.sessionState === SESSION_STATES.PAUSED) {
      return;
    }
    gameState.sessionState = SESSION_STATES.RUNNING;
    render();
  }

function pauseGame() {
  if (gameState.sessionState !== SESSION_STATES.RUNNING) {
    return;
  }
  gameState.sessionState = SESSION_STATES.PAUSED;
  stopOverclock();
  render();
}

  function resumeGame() {
    if (gameState.sessionState !== SESSION_STATES.PAUSED) {
      return;
    }
    gameState.sessionState = SESSION_STATES.RUNNING;
    render();
  }

function togglePause() {
  if (gameState.sessionState === SESSION_STATES.RUNNING) {
    pauseGame();
  } else if (gameState.sessionState === SESSION_STATES.PAUSED) {
    resumeGame();
  }
}

function startOverclock(event) {
  if (gameState.sessionState !== SESSION_STATES.RUNNING) {
    return;
  }
  if (gameState.overclockMeter <= 0) {
    return;
  }
  if (gameState.overclockActive) {
    return;
  }

  gameState.overclockActive = true;
  gameState.overclockHoldSeconds = Math.min(
    FORMULAS.overclock.rampSeconds,
    Math.max(0, gameState.overclockDecaySeconds)
  );
  gameState.overclockDecaySeconds = 0;
  gameState.overclockRechargeRemaining = 0;

  if (event && ui.overclockButton.setPointerCapture) {
    ui.overclockButton.setPointerCapture(event.pointerId);
  }
}

function stopOverclock() {
  if (!gameState.overclockActive) {
    return;
  }

  gameState.overclockActive = false;
  gameState.overclockDecaySeconds = gameState.overclockHoldSeconds;
  gameState.overclockHoldSeconds = 0;
  gameState.overclockRechargeRemaining =
    FORMULAS.overclock.rechargeDelaySeconds;
}

  function handleKeyDown(event) {
    if (event.code !== 'KeyP') {
      return;
    }

    if (gameState.sessionState === SESSION_STATES.RUNNING ||
      gameState.sessionState === SESSION_STATES.PAUSED) {
      event.preventDefault();
      togglePause();
    }
  }

  function restartGame() {
    resetGameState(SESSION_STATES.RUNNING);
    clearSave();
    render();
  }

  function endGame() {
    resetGameState(SESSION_STATES.ENDED);
    clearSave();
    render();
  }

function updateTimers(dt) {
  if (gameState.crashRemaining > 0) {
    gameState.crashRemaining = Math.max(0, gameState.crashRemaining - dt);
  }
}

function updateOverclock(dt) {
  if (gameState.overclockActive) {
    gameState.overclockHoldSeconds = Math.min(
      FORMULAS.overclock.rampSeconds,
      gameState.overclockHoldSeconds + dt
    );
    gameState.overclockMeter = Math.max(
      0,
      gameState.overclockMeter - FORMULAS.overclock.drainRate * dt
    );

    if (gameState.overclockMeter <= 0) {
      gameState.overclockMeter = 0;
      stopOverclock();
    }

    return;
  }

  if (gameState.overclockDecaySeconds > 0) {
    gameState.overclockDecaySeconds = Math.max(
      0,
      gameState.overclockDecaySeconds - dt
    );
  }

  if (gameState.overclockRechargeRemaining > 0) {
    gameState.overclockRechargeRemaining = Math.max(
      0,
      gameState.overclockRechargeRemaining - dt
    );
    return;
  }

  if (gameState.overclockMeter < FORMULAS.overclock.meterMaxSeconds) {
    gameState.overclockMeter = Math.min(
      FORMULAS.overclock.meterMaxSeconds,
      gameState.overclockMeter + FORMULAS.overclock.rechargeRate * dt
    );
  }
}

function updateHashRatePeak(dt) {
  const currentRate = getEffectiveHashRate();
  const decay = FORMULAS.hashFlow.peakDecayPerSecond * dt;

  if (gameState.hashRatePeak === 0) {
    gameState.hashRatePeak = Math.max(currentRate, FORMULAS.hashFlow.minPeak);
    return;
  }

  gameState.hashRatePeak = Math.max(
    currentRate,
    gameState.hashRatePeak - decay
  );

  if (gameState.hashRatePeak < FORMULAS.hashFlow.minPeak) {
    gameState.hashRatePeak = Math.max(
      currentRate,
      FORMULAS.hashFlow.minPeak
    );
  }
}

  function processMining(dt) {
    const effectiveRate = getEffectiveHashRate();
    gameState.hashDust += effectiveRate * dt;
  }

  function processCrashCheck(dt) {
    if (gameState.crashRemaining > 0) {
      return;
    }

    const rateForCrash = getHashRateBeforeCrash();
    if (rateForCrash <= FORMULAS.crash.threshold) {
      return;
    }

    const chancePerSecond = getCrashChancePerSecond();
    const chanceThisFrame = chancePerSecond * dt;

    if (Math.random() < chanceThisFrame) {
      triggerCrash();
    }
  }

  function triggerCrash() {
    gameState.crashRemaining = FORMULAS.crash.pauseSeconds;
    addLogMessage('Crash! Mining paused for 5 seconds.');
  }

  function sellAllHashDust() {
    if (gameState.sessionState !== SESSION_STATES.RUNNING) {
      return;
    }
    if (gameState.hashDust <= 0) {
      return;
    }
    const cashGained = gameState.hashDust * FORMULAS.hashDustToCash;
    gameState.hashDust = 0;
    gameState.cash += cashGained;
    gameState.lifetimeCash += cashGained;
  }

function buyUpgrade(upgradeId) {
    if (gameState.sessionState !== SESSION_STATES.RUNNING) {
      return;
    }
    const upgrade = getUpgradeById(upgradeId);
    const currentLevel = gameState.upgrades[upgradeId];
    const cost = getUpgradeCost(upgrade, currentLevel);

    if (gameState.cash < cost) {
      return;
    }

    gameState.cash -= cost;
    gameState.upgrades[upgradeId] = currentLevel + 1;
  }

  // ===== Prestige subsystem =====
  function reforge() {
    if (gameState.sessionState !== SESSION_STATES.RUNNING) {
      return;
    }
    const totalPoints = FORMULAS.prestige.pointsFromLifetimeCash(
      gameState.lifetimeCash
    );
    if (totalPoints > gameState.blueprintPoints) {
      gameState.blueprintPoints = totalPoints;
    }

  gameState.hashDust = 0;
  gameState.cash = 0;
  gameState.crashRemaining = 0;

    UPGRADES.forEach((upgrade) => {
      gameState.upgrades[upgrade.id] = 0;
    });
  }

  // ===== Rendering (UI updates only) =====
  function render() {
  const effectiveRate = getEffectiveHashRate();
  const isRunning = gameState.sessionState === SESSION_STATES.RUNNING;
  const isPaused = gameState.sessionState === SESSION_STATES.PAUSED;
  const isReady = gameState.sessionState === SESSION_STATES.READY;
  const isEnded = gameState.sessionState === SESSION_STATES.ENDED;
  const canStart = isReady || isEnded;
  const showStartScreen = canStart;
  const meterRatio = getOverclockMeterRatio();
  const meterPercent = Math.round(meterRatio * 100);
  const overclockMultiplier = getOverclockMultiplier();
  const overclockIntensity = getOverclockIntensity(overclockMultiplier);
  const hashflowIntensity = getHashflowIntensity(effectiveRate);

    ui.startScreen.classList.toggle('hidden', !showStartScreen);
    ui.gameShell.classList.toggle('hidden', showStartScreen);

    if (ui.startMessage) {
      ui.startMessage.textContent = isEnded
        ? 'Run ended. Start again to build a new rig.'
        : 'Ready to boot the rig. Start mining to begin.';
    }

    ui.hashDustValue.textContent = formatNumber(gameState.hashDust);
    ui.cashValue.textContent = formatNumber(gameState.cash);
    ui.hashRateValue.textContent = `${formatNumber(effectiveRate)} H/s`;
    ui.sessionStatus.textContent = getSessionStatusLabel();

    if (isPaused) {
      ui.miningStatus.textContent = 'Paused';
    } else if (!isRunning) {
      ui.miningStatus.textContent = 'Inactive';
    } else {
      ui.miningStatus.textContent = gameState.crashRemaining > 0
        ? `Crashed (${formatSeconds(gameState.crashRemaining)})`
        : 'Active';
    }

  if (gameState.overclockActive) {
    ui.overclockStatus.textContent = 'Overclocking';
  } else if (gameState.overclockDecaySeconds > 0) {
    ui.overclockStatus.textContent = 'Cooling';
  } else if (meterRatio >= 1) {
    ui.overclockStatus.textContent = 'Ready';
  } else {
    ui.overclockStatus.textContent = 'Recharging';
  }

  ui.blueprintPoints.textContent = `${gameState.blueprintPoints}`;
  ui.prestigeBonus.textContent =
    `+${formatNumber(getPrestigeBonusMultiplier() * 100 - 100)}%`;
  ui.lifetimeCash.textContent = formatNumber(gameState.lifetimeCash);

  ui.overclockMeterFill.style.width = `${meterPercent}%`;
  ui.overclockMeterText.textContent = `${meterPercent}%`;
  ui.overclockMultiplier.textContent = `${formatNumber(overclockMultiplier)}x`;
  if (gameState.overclockActive) {
    ui.powerStatus.textContent = 'Overclocking';
  } else if (gameState.overclockDecaySeconds > 0) {
    ui.powerStatus.textContent = 'Cooling';
  } else if (meterRatio >= 1) {
    ui.powerStatus.textContent = 'Ready';
  } else {
    ui.powerStatus.textContent = 'Recharging';
  }

  ui.startButton.disabled = !canStart;
  ui.pauseButton.disabled = !(isRunning || isPaused);
  ui.pauseButton.textContent = isPaused ? 'Resume (P)' : 'Pause (P)';
  ui.sellButton.disabled = !isRunning || gameState.hashDust <= 0;
  ui.overclockButton.disabled = !isRunning ||
    (!gameState.overclockActive && gameState.overclockMeter <= 0);
  ui.reforgeButton.disabled = !isRunning;

  ui.pauseOverlay.classList.toggle('hidden', !isPaused);
  ui.pauseOverlay.setAttribute('aria-hidden', String(!isPaused));

  renderRigVisuals(effectiveRate, overclockIntensity, hashflowIntensity);
  renderUpgrades();
  renderLog();
}

function renderUpgrades() {
    const isRunning = gameState.sessionState === SESSION_STATES.RUNNING;
    UPGRADES.forEach((upgrade) => {
      const level = gameState.upgrades[upgrade.id];
      const cost = getUpgradeCost(upgrade, level);
      const row = ui.upgradeRows[upgrade.id];

      row.levelSpan.textContent = `${level}`;

      if (upgrade.type === 'hash') {
        const totalHash = level * upgrade.hashPerLevel;
        row.effectSpan.textContent =
          `Total: +${formatNumber(totalHash)} H/s`;
      } else {
        const reduction = Math.min(1, level * upgrade.crashReductionPerLevel);
        row.effectSpan.textContent =
          `Crash chance reduction: ${formatNumber(reduction * 100)}%`;
      }

      row.costSpan.textContent = formatNumber(cost);
      row.button.disabled = !isRunning || gameState.cash < cost;
    });
  }

  function renderLog() {
    if (gameState.log.length === 0) {
      ui.logEntries.textContent = 'No crashes yet.';
      return;
    }

    ui.logEntries.innerHTML = '';
    gameState.log.forEach((entry) => {
      const div = document.createElement('div');
      div.className = 'log-entry';
      div.textContent = entry;
      ui.logEntries.appendChild(div);
    });
  }

  // ===== Helper calculations =====
  function getUpgradeById(id) {
    return UPGRADES.find((upgrade) => upgrade.id === id);
  }

function getUpgradeCost(upgrade, level) {
  return upgrade.baseCost * Math.pow(upgrade.costMultiplier, level);
}

function renderRigVisuals(effectiveRate, overclockIntensity, hashflowIntensity) {
  if (!ui.rigVisual || !ui.rigSegments) {
    return;
  }

  const cpuLevel = gameState.upgrades.cpu;
  const gpuLevel = gameState.upgrades.gpu;
  const coolingLevel = gameState.upgrades.cooling;

  setSegments(ui.rigSegments.cpu, cpuLevel);
  setSegments(ui.rigSegments.gpu, gpuLevel);
  setSegments(ui.rigSegments.cooling, coolingLevel);

  ui.cpuLevel.textContent = `Lv ${cpuLevel}`;
  ui.gpuLevel.textContent = `Lv ${gpuLevel}`;
  ui.coolingLevel.textContent = `Lv ${coolingLevel}`;

  ui.cpuOverflow.textContent = formatOverflow(cpuLevel, ui.rigSegments.cpu.length);
  ui.gpuOverflow.textContent = formatOverflow(gpuLevel, ui.rigSegments.gpu.length);
  ui.coolingOverflow.textContent = formatOverflow(
    coolingLevel,
    ui.rigSegments.cooling.length
  );

  const ledCount = Math.round(hashflowIntensity * ui.rigSegments.hashflow.length);
  setSegments(ui.rigSegments.hashflow, ledCount, 'hashflow-led--lit');

  ui.hashflowFill.style.width = `${Math.round(hashflowIntensity * 100)}%`;
  ui.hashflowRate.textContent = `${formatNumber(effectiveRate)} H/s`;

  ui.rigVisual.style.setProperty(
    '--overclock-intensity',
    overclockIntensity.toFixed(2)
  );
  ui.rigVisual.style.setProperty(
    '--hashflow-intensity',
    hashflowIntensity.toFixed(2)
  );
}

function setSegments(segments, level, litClass = 'segment--lit') {
  const litCount = Math.min(level, segments.length);

  segments.forEach((segment, index) => {
    if (index < litCount) {
      segment.classList.add(litClass);
    } else {
      segment.classList.remove(litClass);
    }
  });
}

function formatOverflow(level, limit) {
  if (level <= limit) {
    return '';
  }
  return `+${level - limit}`;
}

function getOverclockMeterRatio() {
  if (FORMULAS.overclock.meterMaxSeconds <= 0) {
    return 0;
  }
  return Math.max(
    0,
    Math.min(
      1,
      gameState.overclockMeter / FORMULAS.overclock.meterMaxSeconds
    )
  );
}

function getOverclockMultiplier() {
  if (FORMULAS.overclock.rampSeconds <= 0) {
    return gameState.overclockActive ? FORMULAS.overclock.maxMultiplier : 1;
  }

  const effectiveSeconds = gameState.overclockActive
    ? gameState.overclockHoldSeconds
    : gameState.overclockDecaySeconds;

  if (effectiveSeconds <= 0) {
    return 1;
  }

  const rampRatio = Math.min(
    1,
    effectiveSeconds / FORMULAS.overclock.rampSeconds
  );

  return 1 + (FORMULAS.overclock.maxMultiplier - 1) * rampRatio;
}

function getOverclockIntensity(overclockMultiplier) {
  if (FORMULAS.overclock.maxMultiplier <= 1) {
    return 0;
  }

  return clamp(
    (overclockMultiplier - 1) /
      (FORMULAS.overclock.maxMultiplier - 1),
    0,
    1
  );
}

function getHashflowIntensity(effectiveRate) {
  const peak = Math.max(gameState.hashRatePeak, FORMULAS.hashFlow.minPeak);
  if (peak <= 0) {
    return 0;
  }

  return clamp(effectiveRate / peak, 0, 1);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

  function getSessionStatusLabel() {
    switch (gameState.sessionState) {
      case SESSION_STATES.RUNNING:
        return 'Running';
      case SESSION_STATES.PAUSED:
        return 'Paused';
      case SESSION_STATES.ENDED:
        return 'Ended';
      case SESSION_STATES.READY:
      default:
        return 'Ready';
    }
  }

  function getPrestigeBonusMultiplier() {
    return 1 + (gameState.blueprintPoints * FORMULAS.prestige.bonusPerPoint);
  }

  function getBaseHashRate() {
    return FORMULAS.baseHashRate;
  }

  function getUpgradeHashRate() {
    const cpuLevel = gameState.upgrades.cpu;
    const gpuLevel = gameState.upgrades.gpu;
    return (cpuLevel * getUpgradeById('cpu').hashPerLevel) +
      (gpuLevel * getUpgradeById('gpu').hashPerLevel);
  }

  function getHashRateBeforeCrash() {
  let rate = getBaseHashRate() + getUpgradeHashRate();
  rate *= getPrestigeBonusMultiplier();

  rate *= getOverclockMultiplier();

  return rate;
}

  function getEffectiveHashRate() {
    if (gameState.sessionState !== SESSION_STATES.RUNNING) {
      return 0;
    }
    if (gameState.crashRemaining > 0) {
      return 0;
    }
    return getHashRateBeforeCrash();
  }

  function getCrashChancePerSecond() {
    const coolingLevel = gameState.upgrades.cooling;
    const reduction = coolingLevel * FORMULAS.crash.coolingReductionPerLevel;
    const reductionMultiplier = Math.max(0, 1 - reduction);
    return FORMULAS.crash.chancePerSecond * reductionMultiplier;
  }

  function addLogMessage(message) {
    gameState.log.unshift(message);
    if (gameState.log.length > FORMULAS.maxLogEntries) {
      gameState.log.length = FORMULAS.maxLogEntries;
    }
  }

  function formatNumber(value) {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatSeconds(value) {
    return `${value.toFixed(1)}s`;
  }

  // ===== Persistence =====
  const SAVE_KEY = 'forgehash_mvp_save_v1';

  function createDefaultGameState() {
    const upgradeLevels = {};
    UPGRADES.forEach((upgrade) => {
      upgradeLevels[upgrade.id] = 0;
    });

    return {
      hashDust: FORMULAS.starting.hashDust,
      cash: FORMULAS.starting.cash,
      upgrades: upgradeLevels,
      crashRemaining: FORMULAS.starting.crashRemaining,
      lifetimeCash: FORMULAS.starting.lifetimeCash,
      blueprintPoints: FORMULAS.starting.blueprintPoints,
      overclockMeter: FORMULAS.starting.overclockMeter,
      overclockHoldSeconds: 0,
      overclockDecaySeconds: 0,
      overclockRechargeRemaining: FORMULAS.starting.overclockRechargeRemaining,
      overclockActive: false,
      hashRatePeak: 0,
      log: [],
      sessionState: SESSION_STATES.READY
    };
  }

  function resetGameState(sessionState) {
    const defaults = createDefaultGameState();
    Object.keys(defaults).forEach((key) => {
      gameState[key] = defaults[key];
    });

    if (sessionState) {
      gameState.sessionState = sessionState;
    }
  }

  function clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (error) {
      // Local storage unavailable; ignore.
    }
  }

  function saveGame() {
    if (gameState.sessionState === SESSION_STATES.READY ||
      gameState.sessionState === SESSION_STATES.ENDED) {
      return;
    }

    const data = {
      hashDust: gameState.hashDust,
      cash: gameState.cash,
      upgrades: gameState.upgrades,
      crashRemaining: gameState.crashRemaining,
      lifetimeCash: gameState.lifetimeCash,
      blueprintPoints: gameState.blueprintPoints,
      overclockMeter: gameState.overclockMeter,
      overclockRechargeRemaining: gameState.overclockRechargeRemaining,
      log: gameState.log
    };

    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (error) {
      // Local storage unavailable; ignore.
    }
  }

  function loadGame() {
    let raw;
    try {
      raw = localStorage.getItem(SAVE_KEY);
    } catch (error) {
      return;
    }

    if (!raw) {
      return;
    }

    try {
      const data = JSON.parse(raw);
      applyLoadedState(data);
    } catch (error) {
      // If the save is corrupted, ignore it and start fresh.
    }
  }

  function applyLoadedState(data) {
    const defaults = createDefaultGameState();

    gameState.hashDust = safeNumber(data.hashDust, defaults.hashDust);
    gameState.cash = safeNumber(data.cash, defaults.cash);
    gameState.crashRemaining = safeNumber(
      data.crashRemaining,
      defaults.crashRemaining
    );
    gameState.lifetimeCash = safeNumber(
      data.lifetimeCash,
      defaults.lifetimeCash
    );
    gameState.blueprintPoints = Math.max(
      0,
      Math.floor(safeNumber(data.blueprintPoints, defaults.blueprintPoints))
    );

    UPGRADES.forEach((upgrade) => {
      const loadedLevel = data.upgrades ? data.upgrades[upgrade.id] : 0;
      gameState.upgrades[upgrade.id] = Math.max(
        0,
        Math.floor(safeNumber(loadedLevel, 0))
      );
    });

    if (Array.isArray(data.log)) {
      gameState.log = data.log
        .filter((entry) => typeof entry === 'string')
        .slice(0, FORMULAS.maxLogEntries);
    } else {
      gameState.log = defaults.log;
    }

    gameState.overclockMeter = Math.min(
      FORMULAS.overclock.meterMaxSeconds,
      Math.max(
        0,
        safeNumber(data.overclockMeter, defaults.overclockMeter)
      )
    );
    gameState.overclockRechargeRemaining = Math.max(
      0,
      safeNumber(
        data.overclockRechargeRemaining,
        defaults.overclockRechargeRemaining
      )
    );
    gameState.overclockHoldSeconds = 0;
    gameState.overclockDecaySeconds = 0;
    gameState.overclockActive = false;
    gameState.hashRatePeak = 0;

    gameState.sessionState = SESSION_STATES.READY;
  }

  function safeNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  // ===== Main loop =====
  function startMainLoop() {
    let lastTimestamp = performance.now();

    function frame(timestamp) {
      const deltaSeconds = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;

      update(deltaSeconds);
      render();

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  }
})();
