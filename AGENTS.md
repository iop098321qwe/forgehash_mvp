# AGENTS.md

## Purpose

This document is the exhaustive reference for the ForgeHash MVP code
and gameplay. It exists to guide maintainers and AI agents through the
architecture, mechanics, and implementation details of the single-file
browser game. All work must follow best practices and industry
standards where applicable.

## Scope

This guide covers the HTML in `index.html`, the CSS in `styles.css`, and
the JavaScript in `game.js`, including the runtime mechanics, state
model, and UI flow. It does not cover backend services, build
pipelines, deployments, or external APIs because none exist in this
repository.

## Formatting Rules

- Limit lines to 80 characters.
- Allow exceptions only for URLs, code blocks, tables, hashes, or
  unbreakable commands. Call out exceptions inline.

## Quick Start

- Open `index.html` in a modern browser (double-click or drag into a
  tab).
- Press `Start` on the start screen to begin mining.
- Press `P` or click `Pause` to toggle the pause menu.

## Environment

- Runtime: a modern browser with DOM APIs, ES2015+ support, and
  `localStorage` (the code uses `const`, arrow functions, and
  `localStorage`).
- OS: no OS-specific assumptions are present; any OS with a compatible
  browser works.
- Tooling: no Node.js, package manager, or build tools are required.
- Environment variables: none used (no references exist in
  `index.html`).

## Repository Overview

- The repository root contains `index.html` (markup), `styles.css`
  (styles), `game.js` (logic), and `AGENTS.md` (this reference).
- No top-level source directories are present; `.git/` contains
  version-control metadata only.

## Tracked Files Overview

- None. `git ls-files` returned no tracked files at time of writing.
- If files are added to git, list each tracked file in directory order
  here.

## Architecture

### File layout

- `index.html` contains the HTML markup and links to the local CSS and
  JS files.
- `styles.css` owns the visual presentation and layout rules.
- `game.js` contains the entire game logic and runs in an IIFE
  (`(() => { ... })()`) to avoid polluting the global namespace.
- `game.js` is loaded with `defer` so DOM nodes exist before init.

### State model

- `gameState` is the only mutable state object. It holds:
  - Resources: `hashDust`, `cash`.
  - Upgrades: `upgrades` object keyed by upgrade id.
  - Timers: `crashRemaining`.
  - Overclock: `overclockMeter`, `overclockHoldSeconds`,
    `overclockDecaySeconds`, `overclockRechargeRemaining`,
    `overclockActive`.
  - Progression: `lifetimeCash`, `blueprintPoints`.
  - UI log: `log` array of crash messages.
  - Session control: `sessionState`.
- `SESSION_STATES` defines the allowed session states: `ready`,
  `running`, `paused`, `ended`.
- `FORMULAS` centralizes all tunable numbers, including mining rates,
  crash math, overclock tuning, prestige scaling, save interval, and
  starting values.
- `FORMULAS.starting` provides the default run stash used by
  `createDefaultGameState()`.

### UI structure

- Start screen (`#start-screen`) explains the loop and hosts the Start
  button before the game UI is shown.
- Game shell (`#game-shell`) contains the panels and is hidden until the
  session is running or paused.
- Stats panel shows HashDust, Cash, hash rate, session status, mining
  status, and overclock status.
- Actions panel exposes Pause/Resume toggle, Sell All, and Hold
  Overclock controls with a meter.
- Upgrades panel is populated at runtime from `UPGRADES`.
- Prestige panel shows Blueprint Points, permanent bonus, lifetime cash,
  and the Reforge action.
- Log panel renders crash messages with the newest entries first.
- Pause overlay (`#pause-overlay`) displays the pause menu and blocks
  input when active.

### Initialization flow

- `initUI()` registers DOM listeners and builds upgrade rows.
- `loadGame()` restores saved data and always forces the session to the
  `ready` state so the player must press Start after load.
- `startMainLoop()` begins a `requestAnimationFrame` loop that always
  calls `render()` and conditionally calls `update()`.

### Update loop and timing

- `update(deltaSeconds)` clamps large deltas to
  `FORMULAS.maxDeltaSeconds` to avoid unintended offline progress.
- When the session is not `running`, `update()` returns early so mining
  and timers freeze during Ready, Paused, and Ended states.
- `render()` runs every frame to keep UI and pause overlay in sync with
  the current state.
- Start screen visibility is driven by session state (`ready` or
  `ended`).

### Mining formula

- Base hash rate is `FORMULAS.baseHashRate`.
- Upgrade hash rate is the sum of CPU and GPU levels multiplied by each
  upgrade's per-level contribution.
- Prestige multiplier is `1 + blueprintPoints * bonusPerPoint`.
- Overclock multiplies total hash rate by the current ramped multiplier
  while held.
- Effective hash rate becomes zero when the game is paused, not
  started, ended, or in a crash cooldown.

### Overclock (hold)

- Holding the Overclock button drains `overclockMeter` while building a
  multiplier up to `FORMULAS.overclock.maxMultiplier`.
- `overclockHoldSeconds` tracks the ramp time, capped by
  `FORMULAS.overclock.rampSeconds`.
- Releasing sets `overclockActive` to false and starts a recharge delay
  (`overclockRechargeRemaining`).
- `overclockDecaySeconds` tracks the smooth ramp-down after release.
- Once the delay expires, the meter recharges at
  `FORMULAS.overclock.rechargeRate` until it reaches
  `FORMULAS.overclock.meterMaxSeconds`.

### Crash system

- Crash checks run only when not already crashed and only during active
  runs.
- When the pre-crash rate exceeds `FORMULAS.crash.threshold`, a per
  frame chance of `chancePerSecond * dt` is used.
- Cooling reduces crash chance by a multiplier of
  `max(0, 1 - level * coolingReductionPerLevel)`.
- Crashes set `crashRemaining` to `pauseSeconds` and add a log entry.

### Upgrades

- `UPGRADES` defines exactly three upgrades: CPU, GPU, and Cooling.
- Each upgrade has `baseCost`, `costMultiplier`, and a per-level effect.
- Costs scale exponentially: `baseCost * costMultiplier^level`.
- CPU and GPU add hash rate; Cooling reduces crash probability.
- Upgrade buttons are disabled when the run is inactive or cash is
  insufficient.

### Selling and currency

- Selling converts all HashDust into Cash at the ratio defined by
  `FORMULAS.hashDustToCash` (currently 1:1).
- `lifetimeCash` accumulates across all runs and is used for prestige
  scaling.

### Prestige (Reforge)

- Blueprint Points are computed as
  `floor(sqrt(lifetimeCash / 1000))`.
- Reforge sets blueprint points to the maximum earned so far, then
  resets HashDust, Cash, timers, and upgrade levels.
- Lifetime cash and blueprint points persist across reforges.

### Session control and pause menu

- `startGame()` transitions from Ready or Ended to Running.
- `pauseGame()` and `resumeGame()` toggle Running and Paused.
- `togglePause()` powers the Pause button and `P` key behavior.
- The pause overlay visibility is driven entirely by render-state.

### Restart and End

- `restartGame()` wipes all progress, clears the save, and immediately
  starts a new run (`sessionState` becomes `running`).
- `endGame()` wipes all progress, clears the save, and returns to the
  start screen (`sessionState` becomes `ended`).

### Rendering model

- `render()` reads from `gameState` and writes only to DOM nodes.
- DOM element references are cached in the `ui` object to avoid repeated
  queries.
- Button state is derived from session state and resource totals.
- Start screen and game shell visibility are driven by session state.
- The log panel is re-rendered each frame from `gameState.log`.

### Persistence

- Save key: `forgehash_mvp_save_v1` in `localStorage`.
- `saveGame()` writes numeric state, upgrades, timers, and log entries.
- Overclock meter and recharge delay are persisted in saves.
- Saves run every `FORMULAS.saveIntervalMs` and on `beforeunload`.
- Saves are skipped when the session is Ready or Ended.
- Storage calls are wrapped in `try/catch` to avoid errors when
  `localStorage` is unavailable.
- `applyLoadedState()` validates loaded values and resets session state
  to Ready.

### Numeric formatting

- `formatNumber()` renders values with two decimal places using
  `toLocaleString`.
- `formatSeconds()` renders timers with one decimal place.

### Design rationale

- Centralized `FORMULAS` makes balance changes localized and safe.
- A single `gameState` simplifies persistence and reset logic.
- The update/render split avoids DOM work in logic and keeps UI
  consistent.
- Session gating prevents auto-start and unintended background gains.
- The pause overlay is CSS-driven and controlled exclusively by state.
- The start screen prevents accidental starts and teaches core actions.
- Separating HTML, CSS, and JS keeps concerns distinct without adding
  build tools.

## Commands

- No build or run commands exist. The app runs by opening
  `index.html` in a browser.

## Testing

- No test files or test commands are present in the repo.
- If tests are added, document the commands and structure here.

## Linting and Formatting

- No linting or formatting configuration exists in the repo.
- Maintain the existing style: sectioned comments and clear
  function-level separation.

## CI and Release

- No CI or release configuration exists in the repo.

## Conventions

- Keep HTML in `index.html`, CSS in `styles.css`, and JavaScript in
  `game.js` unless the project scope changes.
- Keep all tunable numbers in `FORMULAS` and avoid inline magic values.
- Only mutate state inside logic functions; UI code should read state
  and update DOM only.
- Use `SESSION_STATES` for any new action gating or UI behavior.
- Keep all DOM IDs mapped in the `ui` object for clarity.
- Use early returns for invalid state or insufficient resources.
- Use `addLogMessage()` for new log entries to maintain ordering and
  size limits.
- Keep code ASCII-only and avoid external assets or libraries.
- Keep the UI in Catppuccin Mocha; `styles.css` defines the full palette
  in `:root` and UI colors must use those variables.
- Prefer semantic color aliases (`--color-*`) over direct palette values
  when styling new components.

## Security and Compliance

- No secrets, network requests, or credentials are present.
- `localStorage` holds only game progress; do not store sensitive data.
- Compliance requirements are not specified in this repo. Verification
  needed if external policies apply.

## Dependencies and Services

- No third-party libraries, services, or external APIs are used.

## Troubleshooting

- Game does not start: use the Start button on the start screen (shown
  only in Ready or Ended state).
- Hash rate is zero: check for Paused status, Ended status, or crash
  cooldown.
- Overclock is unavailable: wait for the meter to recharge.
- Pause overlay will not close: press `P` or click `Resume`.
- Saves do not persist: ensure browser `localStorage` is enabled.
- Upgrades are disabled: confirm the session is Running and cash is
  sufficient.
- Start button is missing: End the run to return to the start screen.
- UI is unstyled or buttons do nothing: confirm `styles.css` and
  `game.js` are in the same directory as `index.html`.

## Refining Existing AGENTS.md

- Verify every statement against the repo or explicit user input.
- Remove stale or duplicated content.
- Keep section order aligned with the template.
- Replace vague guidance with concrete paths and behaviors.
- Add "Verification needed" notes when information is missing.
- Optimize for AI consumption with short, atomic bullets.

## Maintenance

After any code or config change, run the self-audit loop:

1. Re-scan repo structure and tooling.
2. Re-scan tracked files and update the file list.
3. Verify commands still match the repo state.
4. Compare each section against current code.
5. Update AGENTS.md to resolve mismatches.
6. Remove any update notes or logs from AGENTS.md.
