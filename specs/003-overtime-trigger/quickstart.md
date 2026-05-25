# Quickstart: Overtime Trigger

**Feature**: 003-overtime-trigger
**Date**: 2026-05-18

Manual verification flow that proves the feature works end-to-end in a browser, once the tasks in `tasks.md` are implemented. Run automated tests with `npm test` from `packages/web`.

## Prerequisites

- Repo at branch `003-overtime-trigger`.
- Implementation complete (all tasks in `tasks.md` checked off).
- `cd packages/web && npm install` already done.

## Start the dev server

```bash
cd packages/web
rm -rf .next                 # only if Tailwind config recently changed
npm run dev
```

Open `http://localhost:3000` in a browser.

## 1. Verify the new setup-page fields

1. Go to `/setup`.
2. Scroll to the **Game Settings** section.
3. **Expected**: Two new fields visible alongside the existing duration inputs:
   - `Overtime length (min)` — pre-filled with `5`.
   - `Overtime` toggle — two buttons `On` / `Off`, with `On` highlighted for the default 5v5 format.
4. Click the `3v3` format toggle. **Expected**: `Overtime` toggle flips to `Off` highlighted (the default for 3v3), while `Overtime length (min)` remains `5`.
5. Switch back to `5v5`. **Expected**: `Overtime` toggle returns to `On`.

## 2. Verify tied regulation routes into OT

1. From setup, complete a 5v5 game configuration with overtime enabled (default).
2. Tap **Continue to Game**, then **Tip Off**.
3. Score so both teams have the same points (e.g., home +3 on a 3PT from player 1, away +3 on a 3PT from player 11).
4. End each of periods 1, 2, 3 with the score tied. Use the existing **Start Next Quarter** / **Start Second Half** flow to advance.
5. While in period 4, end the period with score still tied.
6. **Expected**:
   - The game does NOT show "Final" — instead the scoreboard centre column shows `4th` then `OT` after the next tap.
   - The action pad shows **Start Overtime** as the primary CTA.
7. Tap **Start Overtime**.
8. **Expected**: Period label flips to `OT`, the live clock starts at `05:00` (5 minutes), `Start Clock` button reappears.

## 3. Verify multi-overtime loop

1. From the OT period started in step 2, score so both teams remain tied (e.g., home +2, away +2).
2. End the OT period.
3. **Expected**: Status flips to break, period label still shows `OT` (current period), action pad shows **Start Overtime**.
4. Tap **Start Overtime**.
5. **Expected**: Period label flips to **`2OT`** (new format — not `OT2`).
6. Repeat the tied-end-period cycle once more.
7. **Expected**: After the next `Start Overtime`, period label shows **`3OT`**.

## 4. Verify finalization on un-tied OT

1. From a 2OT or 3OT period, score so one team leads (e.g., home +2 with no response).
2. End the period.
3. **Expected**: Status flips to `finished`, scoreboard centre column shows **`Final`**, no `Start Overtime` button.

## 5. Verify the opt-out toggle (FIBA 3x3 sudden-death case)

1. Return to setup. Switch to `5v5` format. Set `Overtime` toggle to **Off**.
2. Continue to game and play a tied regulation end-to-end (or use direct store mutations to fast-forward — `useGameStore.getState()`).
3. End period 4 with the score tied.
4. **Expected**: Game transitions to `finished` immediately. The action pad shows **Final** with the tied score; **no Start Overtime button**.

## 6. Verify play-by-play period labels

1. From any of the OT scenarios above, navigate to the **Play-by-Play** view (GameLog).
2. **Expected**: Events recorded during OT periods are labelled with the new format — `OT`, `2OT`, `3OT`, etc., matching the scoreboard centre column.

## 7. Verify regression: existing flows still work

- Regulation 1–4 transitions (no OT) work exactly as before.
- Recording scores, fouls, substitutions, timeouts: unaffected.
- Stats page totals match the scoreboard.
- All unit tests pass: `npm test`.
- TypeScript compiles cleanly: `npm run typecheck`.
- Lint passes: `npm run lint`.

## What this quickstart does NOT verify

- Sudden-death OT scoring rules (FIBA 3x3 first-to-2) — explicitly out of scope; the toggle just disables this app's timed-OT trigger.
- Persistence across page refreshes (no persistence layer in this feature).
- Accessibility announcements for OT-period transitions — covered by the constitution's WCAG 2.1 AA mandate; verify with a screen reader pass if your league requires it.
