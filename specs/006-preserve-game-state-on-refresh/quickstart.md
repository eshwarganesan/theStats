# Quickstart: Preserve Game State on Browser Refresh

**Branch**: `006-preserve-game-state-on-refresh` | **Date**: 2026-06-07

Walk-through for verifying the feature end-to-end once tasks land. Mirrors the acceptance scenarios in [spec.md](./spec.md).

## Prerequisites

- `npm install` at repo root (workspace install).
- Dev server: `npm run dev` (serves at http://localhost:3000).
- DevTools open, Application → Local Storage panel visible.

## Manual smoke walk-throughs

### Scenario A — Refresh during live play (User Story 1.1, 1.2)

1. From the home page, click "New Game →". You should land on `/setup` with empty rosters. Local Storage panel: `thestats.game.v1` is **absent** (was wiped by the New Game button) or about to be created on first edit.
2. Fill both rosters with the minimum 5 starters each, click "Continue to Game". You should land on `/game`.
3. Click "Tip Off", then click the clock to start it. Record a couple of scores and a foul.
4. Confirm Local Storage now shows `thestats.game.v1` with the events, and `thestats.clock.v1` updating roughly once per second.
5. Refresh the browser.
6. Verify: you are back on `/game` (not on home or setup), the score and event log match, the period and possession match, and the clock is **paused** with a value within 1 second of what it showed before the refresh. Pressing the clock start control resumes ticking.

### Scenario B — Refresh during a timeout / period break (User Story 1.3)

1. From a live game, record a timeout. The break countdown should start.
2. Refresh while the break is mid-countdown.
3. Verify: you land back on the timeout view, the countdown is **paused** within 1 second of where it was, and resuming it ticks down again.

### Scenario C — Refresh mid-setup (User Story 1.4)

1. From the home page, click "New Game →". Add 2 players to the home team (not the full 5).
2. Refresh.
3. Verify: you are back on `/setup`, the 2 partial-roster entries are still there.

### Scenario D — Refresh of a finished game (User Story 1.5)

1. Play through to the final period and exhaust the clock so the game enters `finished`.
2. Refresh.
3. Verify: the finished view is restored, the box score / event log are intact, and there is no automatic reset.

### Scenario E — "New Game" wipes prior game (User Story 2)

1. From a finished game in scenario D, navigate back to the home page.
2. Click "New Game →".
3. Verify: Local Storage `thestats.game.v1` and `thestats.clock.v1` are both gone, `/setup` is empty, and refreshing keeps you on the empty `/setup` (does not resurrect the prior game).

### Scenario F — Storage unavailable

1. Open the app in a Safari private window (or in Chrome with Application → Storage → "Block third-party cookies" + clear site data, then disable storage via DevTools → Application → Storage → "Storage" → toggle).
2. Load the home page.
3. Verify: a blocking modal appears titled "Saving is disabled" with a single "Continue without saving" action. Clicking it dismisses the modal and lets you use the app normally. The modal re-appears on the next reload.

### Scenario G — Corrupted record fallback (FR-008)

1. In DevTools console, run: `localStorage.setItem("thestats.game.v1", "{not json")`.
2. Refresh.
3. Verify: you land on the empty `/setup` (not on `/game` and not on a crash screen). A dismissable banner says the prior game could not be recovered. `thestats.game.v1` and `thestats.clock.v1` have been deleted.

## Automated test coverage

After implementation lands, the following commands must all be green:

```bash
npm run typecheck
npm run lint
npm run test              # vitest: persistence module, store rehydration, clock checkpoint, modal
npm run test:e2e          # playwright: tests/e2e/persistence.spec.ts covers Scenarios A–G
npm run test:all          # the aggregate gate
```

The Playwright spec must include at least one test per scenario above, using `page.evaluate(() => localStorage.clear())` between tests for isolation.
