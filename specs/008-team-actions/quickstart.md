# Quickstart: Team Actions

How to build, test, and manually verify this feature. Assumes the repo is installed
(`npm install` at root) and you are on branch `008-team-actions`.

## Build & quality gates

```bash
npm run typecheck   # strict TS — new union variants must be exhaustively handled
npm run lint
npm run test        # Vitest unit/component
npm run test:e2e    # Playwright (team-actions flow)
```

Per Constitution Principle I, write each test first and watch it fail before implementing.

## Where things live

| Concern | File |
|---------|------|
| Event/type shapes | `packages/core/src/types.ts` |
| Violation kinds + labels | `packages/core/src/constants.ts` |
| Stats fold | `packages/core/src/stats.ts` |
| Store mutators + edit/delete | `packages/web/src/lib/store.ts` |
| Team Actions button | `packages/web/src/components/game/TeamPanel.tsx` |
| Modal | `packages/web/src/components/game/TeamActionsModal.tsx` |
| Play-by-play labels | `packages/web/src/components/game/GameLog.tsx` |
| Page wiring | `packages/web/src/app/game/page.tsx` |

## Manual verification (maps to acceptance scenarios)

1. **Placement (FR-001)** — Start a game and open the live console. Each team panel footer
   shows three controls in order: **Sub · Team Actions · Timeout**.

2. **Violation turnover (US1)** — With the game live, tap **Team Actions** on the home
   team, choose **24-second violation**, confirm. The home team's turnover total (header)
   increments by 1; a `TO` entry appears in the play-by-play attributed to the team (no
   player). No player's turnover count changes.

3. **Additive score award (US2)** — Before tip-off (`ready` state) tap **Team Actions**,
   enter **5** points with reason "missing jersey", confirm. The home score increases by 5
   and a `+PTS` entry appears in the log. No player's points change.

4. **Never subtract (FR-009 / SC-003)** — In the award form, try `0`, a negative, or a
   decimal. **Confirm stays disabled** and no event is recorded. Confirm the same guard by
   editing an existing award down to `0` in the play-by-play — the edit is rejected.

5. **Turnover gating (FR-016)** — In the `ready` (pre-tip) state, the turnover section is
   disabled while the score-award section is usable. Turnovers become available once the
   game is live.

6. **Undo (FR-011)** — Record a team action, then undo. The affected total/score returns
   to its prior value and the log entry disappears.

7. **Edit / delete (FR-015)** — From the play-by-play, edit a team action (change turnover
   kind, or lower a score award to a smaller positive amount) and delete a team action.
   Stats re-derive correctly in both cases.

8. **Cancel is inert (FR-012)** — Open the modal and dismiss it (Cancel / backdrop). No
   stat or score changes.

## Persistence check

Refresh the page mid-game (feature 006): recorded team turnovers and score awards survive
because they ride the existing persisted `events` array (`thestats.game.v1`). No schema
migration is involved.
