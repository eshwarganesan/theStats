# Quickstart: Timeout & Period-Break Timer

**Feature**: 002-timeout-break-timer
**Date**: 2026-05-16

This is the manual verification flow that proves the feature works end-to-end in a browser, once the tasks in `tasks.md` are implemented. Run automated tests with `npm test` from `packages/web` for the unit-level coverage.

## Prerequisites

- Repo at branch `002-timeout-break-timer`.
- Implementation complete (all tasks in `tasks.md` checked off).
- `cd packages/web && npm install` already done.

## Start the dev server

```bash
cd packages/web
rm -rf .next                 # only if you changed Tailwind config recently
npm run dev
```

Open `http://localhost:3000` in a browser.

## 1. Verify the new setup-page inputs

1. Navigate to **Setup** (the landing page should link there, or go to `/setup`).
2. Scroll to the **Game Settings** section at the top.
3. **Expected**: Three new inputs are visible alongside the existing Period length / Periods / Timeouts / Bonus fouls fields:
   - `Timeout (sec)` — pre-filled with `60`.
   - `Quarter break (sec)` — pre-filled with `120`.
   - `Halftime (sec)` — pre-filled with `600`.
4. Change `Timeout (sec)` to `45`. Hit Tab. **Expected**: value persists in the store (open React DevTools or just continue — the value will be used when you call a timeout).

## 2. Verify the timeout countdown and "End Timeout" button

1. Complete setup (add 5 starters per side, tap **Continue to Game**).
2. Tap **Tip Off**. The clock should be at 10:00 and **Stop Clock** is visible.
3. Tap **Stop Clock** (or start it and let it run a few seconds, then stop). The clock pauses, e.g. at `09:52`.
4. From the home team panel, tap the timeout button.
5. **Expected**:
   - The clock display switches to a countdown starting at `00:45` (the configured timeout duration).
   - The countdown ticks down once per second visibly.
   - The **ActionPad** shows ONLY one large primary button labeled **End Timeout**.
   - The **Undo** and **End Period** secondary buttons in the ActionPad are **hidden**.
   - The team panels' action controls (record points / fouls / etc.) remain present but the central ActionPad does not show its normal in-play CTA.
6. While the countdown ticks, tap the clock area. **Expected**: the existing tap-to-edit input appears, pre-filled with the current countdown value (e.g., `00:43`). Hit Escape to cancel.
7. Tap the `+1m` nudge button. **Expected**: countdown jumps up by 60 seconds.
8. Tap **End Timeout**. **Expected**:
   - The clock display switches back to the live game time (`09:52` from step 3).
   - The countdown disappears.
   - The ActionPad returns to showing **Start Clock** and the Undo / End Period secondary controls reappear.
   - The `timeout` event remains in the game log (timeout was still recorded, only its termination is not).

## 3. Verify the between-quarter break countdown

1. From a live, paused state, drain the clock to `00:00` (use the `-1m` nudge a few times to get there quickly, then commit `0:00` via tap-to-edit).
2. The ActionPad now shows the **End Period** primary CTA. Tap it.
3. **Expected**:
   - Status transitions to `period-break`.
   - Clock display switches to a countdown at `02:00` (the configured quarter break).
   - ActionPad shows only **Start Next Quarter** (no Undo / End Period visible).
4. Tap **Start Next Quarter**.
5. **Expected**:
   - Period advances (e.g. from 1st to 2nd).
   - Clock resets to the configured period length (10:00 by default).
   - ActionPad returns to live-play controls.

## 4. Verify the halftime break countdown

1. Repeat step 3 until you've ended the **2nd** quarter (period 2 of 4).
2. **Expected**:
   - Status transitions to `period-break`.
   - Clock display switches to a countdown at `10:00` (the configured halftime, longer than the quarter break).
   - ActionPad shows **Start Second Half**.
3. Tap **Start Second Half**.
4. **Expected**: period advances to 3rd, clock resets to 10:00, ActionPad returns to live controls.

## 5. Verify the zero-countdown fallback behavior

1. Open **Setup** and set `Timeout (sec)` to `0`. Continue to game.
2. From a paused live state (e.g., clock at `09:52`), call a timeout (any team).
3. **Expected**:
   - The clock area continues to display the live game time (`09:52`) — no countdown is shown because the configured timeout was zero.
   - The **End Timeout** button is visible in the ActionPad.
4. Tap **End Timeout**. Live play resumes from `09:52` as expected.

Now verify the same fallback when a non-zero countdown ticks down:

5. Open Setup, set `Timeout (sec)` back to `5`. Return to game.
6. Pause the clock and call a timeout.
7. **Expected**:
   - Countdown starts at `00:05` and ticks down.
   - When it reaches `00:00`, the clock display swaps to the live game clock (whatever paused value it held before the timeout was called).
   - The **End Timeout** button stays visible and tappable throughout.
8. Tap **End Timeout** to resume live play.

## 6. Verify regression: existing flows still work

- Recording scores, fouls, substitutions, and stats works exactly as before in live play.
- Stats page renders correctly with new game data (no regressions to box-score OREB / DREB / REB columns from the earlier feature).
- All 270+ unit tests pass: `npm test`.
- TypeScript compiles cleanly: `npm run typecheck`.
- Lint passes: `npm run lint`.

## What this quickstart does NOT verify

- Multi-game persistence (no persistence layer changed).
- Network behavior (none — this is a fully client-side feature).
- Accessibility announcements for the ticking countdown (a11y posture is mandated by the constitution at WCAG 2.1 AA; specific aria-live cadence for the countdown is left to implementation choice — verify with a screen reader pass if your league requires it).
