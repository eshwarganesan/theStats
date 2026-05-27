# Quickstart: Edit and Delete Play-by-Play Events

**Feature**: 004-edit-play-events  
**Date**: 2026-05-26

Manual verification flow for the three user stories in [spec.md](./spec.md). Run alongside automated tests as the final acceptance gate before merge. Each block can be executed independently and asserts a P-tier user story.

## Setup (once, before each block)

1. From the repo root: `npm install` (if needed), then `npm run dev` and open the URL printed in the terminal.
2. On the setup page, accept the default 5v5 settings.
3. Fill both rosters with at least 5 players each, mark exactly 5 starters on each side, and give every player a unique jersey number.
4. Click `Prepare game` → `Start game`.
5. Press the clock start button to put the game `live`.

## US1 (P1) — Correct a mis-attributed play

**Goal**: change a recorded score's side and player without touching anything else.

1. With Home selected as the active side in the action pad, record a made 2-point shot for Home #10 (or whatever number you assigned to the first home starter).
2. In the play-by-play log, locate the row "#10 [Name] scored 2 PT".
3. Click the row's **Edit** button. The edit modal opens, pre-filled with `clockAt` = the current clock value, side = `home`, player = #10, kind = `2pt`, made = `true`.
4. Change `side` to `away`. The player selector resets.
5. Pick Away #7 from the player selector.
6. Click `Save`.

**Expected**:

- Modal closes.
- The log row now reads "#7 [Name] scored 2 PT" with the side accent color flipped to away.
- The scoreboard's Home points decrement by 2; Away points increment by 2.
- In the team panels, Home #10's points decrement by 2 and Away #7's points increment by 2.

**SC mapping**: SC-001 (under 15 s), SC-003 (within 1 s of confirm), SC-004 (no invalid state).

## US2 (P2) — Delete an accidental play

**Goal**: remove a single past event from the middle of the log without disturbing other entries.

1. Record an offensive rebound stat for Home #10.
2. Record any two further events (e.g., a foul on Away #5, then a 3pt make for Home #11). The original stat row is now several rows below the top.
3. Locate the rebound stat row in the log.
4. Click that row's **Delete** button. The delete confirmation modal opens with a one-line summary like "Delete: #10 [Name] — Off. Reb?"
5. Click `Delete`.

**Expected**:

- Modal closes.
- The rebound stat row disappears from the log.
- The two later rows (foul and 3pt make) remain unchanged in their previous order.
- Home #10's rebound count decrements by 1 in the team panel; team-level rebound count reflects the change.

Now repeat steps 1-3 but in step 4 click `Cancel` instead.

**Expected**: nothing changes — the rebound stat row is still present.

**SC mapping**: SC-002 (under 5 s), SC-006 (only one event removed), and FR-015 (Cancel preserves the event).

## US3 (P3) — Correct the game-clock time of a past play

**Goal**: adjust a recorded event's `clockAt` without changing anything else.

1. Stop the live clock (this is not required, but makes the comparison easy).
2. With the clock at, say, 4:18, record a personal foul on Home #10.
3. Locate the foul row.
4. Click the row's **Edit** button. The edit modal opens.
5. Change the `clockAt` input from `4:18` to `4:23`. Leave all other fields alone.
6. Click `Save`.

**Expected**:

- Modal closes.
- The log row's displayed clock changes from `4:18` to `4:23`.
- No other change anywhere (foul count, scoreboard, current live clock value).
- Player and team foul counts are unchanged.

### Negative case for US3

Repeat steps 1-5 but enter `25:00` (a value greater than the period length, e.g., 10 minutes).

**Expected**:

- Inline error appears in the modal indicating the value is out of range.
- The `Save` button is disabled.
- Clicking `Cancel` discards the change.

**SC mapping**: FR-010 (range), FR-010a (parseable format).

## Edge-case spot checks

Quick checks to run after the three primary flows.

### Side change without selecting a new player

1. Edit any score event.
2. Change `side` to the other team. **Do not** pick a new player.
3. Observe: `Save` is disabled with an inline hint that a player must be selected from the new side's roster.

### Deleting an event that affected stats

After US2, open the team panels and confirm the rebound count for Home is one lower than before. After US1, confirm scoreboard totals and per-player points reflect the side flip.

### Edit/Delete affordance visibility per row type

Scroll the play-by-play log and confirm:

- `score`, `foul`, `stat`, `timeout` rows show **Edit** and **Delete** buttons.
- `substitution` rows show neither button.
- `period start` / `period end` rows show neither button.
- `clock adjust` rows (created by editing the live clock) show neither button.

This validates Spec FR-001 and FR-002 visually.

### Post-game edit

End the game (advance to `finished`). Confirm the Edit and Delete buttons still appear on score/foul/stat/timeout rows and still work (Spec FR-017, Clarification Q5).

## What success looks like at the end

- All three primary blocks pass.
- All three edge-case spot checks pass.
- `npm run typecheck`, `npm run lint`, `npm run test:coverage`, and `npm run test:e2e` are green.
