(() => {
  'use strict';

  // ===== Constants and formulas (centralized) =====
  const FORMULAS = {
    baseHashRate: 0.1,
    hashDustToCash: 1,
    boostMultiplier: 2,
    boostDurationSeconds: 5,
    starting: {
      hashDust: 7,
      cash: 8,
      lifetimeCash: 0,
      blueprintPoints: 0,
      manualBoostRemaining: 0,
      crashRemaining: 0
    },
    crash: {
      threshold: 5,
      chancePerSecond: 0.02,
      pauseSeconds: 5,
      coolingReductionPerLevel: 0.1
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
    boostStatus: document.getElementById('boost-status'),
    startButton: document.getElementById('start-btn'),
    startScreen: document.getElementById('start-screen'),
    startMessage: document.getElementById('start-message'),
    gameShell: document.getElementById('game-shell'),
    pauseButton: document.getElementById('pause-btn'),
    sellButton: document.getElementById('sell-btn'),
    boostButton: document.getElementById('boost-btn'),
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
    upgradeRows: {}
  };

  // ===== Initialization =====
  initUI();
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
    ui.boostButton.addEventListener('click', activateManualBoost);
    ui.reforgeButton.addEventListener('click', reforge);
    ui.resumeButton.addEventListener('click', resumeGame);
    ui.restartButton.addEventListener('click', restartGame);
    ui.endButton.addEventListener('click', endGame);
    window.addEventListener('keydown', handleKeyDown);

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

  // ===== Game logic =====
  function update(deltaSeconds) {
    // Clamp large deltas so opening a hidden tab does not grant offline progress.
    const dt = Math.min(deltaSeconds, FORMULAS.maxDeltaSeconds);

    if (gameState.sessionState !== SESSION_STATES.RUNNING) {
      return;
    }

    updateTimers(dt);
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
    if (gameState.manualBoostRemaining > 0) {
      gameState.manualBoostRemaining = Math.max(
        0,
        gameState.manualBoostRemaining - dt
      );
    }
    if (gameState.crashRemaining > 0) {
      gameState.crashRemaining = Math.max(0, gameState.crashRemaining - dt);
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

  function activateManualBoost() {
    if (gameState.sessionState !== SESSION_STATES.RUNNING) {
      return;
    }
    gameState.manualBoostRemaining = FORMULAS.boostDurationSeconds;
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
    gameState.manualBoostRemaining = 0;
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

    if (isPaused) {
      ui.boostStatus.textContent = gameState.manualBoostRemaining > 0
        ? `Paused (${formatSeconds(gameState.manualBoostRemaining)})`
        : 'Paused';
    } else if (isRunning && gameState.manualBoostRemaining > 0) {
      ui.boostStatus.textContent =
        `Active (${formatSeconds(gameState.manualBoostRemaining)})`;
    } else {
      ui.boostStatus.textContent = 'Inactive';
    }

    ui.blueprintPoints.textContent = `${gameState.blueprintPoints}`;
    ui.prestigeBonus.textContent =
      `+${formatNumber(getPrestigeBonusMultiplier() * 100 - 100)}%`;
    ui.lifetimeCash.textContent = formatNumber(gameState.lifetimeCash);

    ui.startButton.disabled = !canStart;
    ui.pauseButton.disabled = !(isRunning || isPaused);
    ui.pauseButton.textContent = isPaused ? 'Resume (P)' : 'Pause (P)';
    ui.sellButton.disabled = !isRunning || gameState.hashDust <= 0;
    ui.boostButton.disabled = !isRunning;
    ui.reforgeButton.disabled = !isRunning;

    ui.pauseOverlay.classList.toggle('hidden', !isPaused);
    ui.pauseOverlay.setAttribute('aria-hidden', String(!isPaused));

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

    if (gameState.manualBoostRemaining > 0) {
      rate *= FORMULAS.boostMultiplier;
    }

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
      manualBoostRemaining: FORMULAS.starting.manualBoostRemaining,
      crashRemaining: FORMULAS.starting.crashRemaining,
      lifetimeCash: FORMULAS.starting.lifetimeCash,
      blueprintPoints: FORMULAS.starting.blueprintPoints,
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
      manualBoostRemaining: gameState.manualBoostRemaining,
      crashRemaining: gameState.crashRemaining,
      lifetimeCash: gameState.lifetimeCash,
      blueprintPoints: gameState.blueprintPoints,
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
    gameState.manualBoostRemaining = safeNumber(
      data.manualBoostRemaining,
      defaults.manualBoostRemaining
    );
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
