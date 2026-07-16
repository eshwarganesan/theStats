# Contract: Store API & Component Interfaces — Team Actions

This feature exposes no HTTP/network surface. Its "interface" is the Zustand store API
(`packages/web/src/lib/store.ts`) plus the props of the new/changed React components. This
contract is the source of truth for the Phase 2 test tasks.

## Store mutators (new)

### `recordTeamTurnover(side, kind, clockAt?)`

```ts
recordTeamTurnover: (
  side: Side,
  kind: TeamTurnoverKind,
  clockAt?: number,
) => void;
```

- Appends a `team-turnover` event with `period = currentPeriod`,
  `clockAt = clockAt ?? clockSeconds`, `timestamp = Date.now()`, `id = uid()`.
- Mutates only the `events` array (append). No status/clock side effects.
- **Contract tests**
  - Appends exactly one event of `type: "team-turnover"` with the given `side`/`kind`.
  - Charged team's derived `teamTurnovers` increments by 1; other team unchanged.
  - No player's `turnovers` changes (FR-005).
  - `clockAt` override is honored when supplied; falls back to live `clockSeconds` otherwise.

### `recordTeamScoreAdjust(side, points, reason, clockAt?)`

```ts
recordTeamScoreAdjust: (
  side: Side,
  points: number,
  reason: string,
  clockAt?: number,
) => void;
```

- **Guard**: if `!Number.isInteger(points) || points <= 0`, the call is a **no-op**
  (returns current state unchanged). No event is appended.
- Otherwise appends a `team-score-adjust` event with the fields above and
  `reason` stored verbatim (may be `""`).
- **Contract tests**
  - Valid positive integer → appends one event; charged team's `points` increases by
    exactly `points`; no player `points` change (FR-007, FR-008).
  - `points = 0`, negative, or non-integer → no event appended, score unchanged (FR-009, SC-003).
  - Blank `reason` is accepted and preserved (Clarification Q2).
  - `clockAt` override honored; falls back to `clockSeconds`.

### `editEvent(id, patch)` (extended)

- Accepts `patch.type` of `"team-turnover"` or `"team-score-adjust"` (matching the target
  event's type; mismatch remains a no-op).
- `team-turnover` patch may change `clockAt`, `side`, `kind`.
- `team-score-adjust` patch may change `clockAt`, `side`, `points`, `reason`.
  - **Guard**: the resolved post-edit `points` MUST satisfy `Number.isInteger && > 0`,
    else the edit is a **no-op** (additive-only preserved on edit — FR-015, SC-003).
- `clockAt`, when provided, is validated against the event's period length (existing rule).
- **Contract tests**
  - Editing a turnover's `kind` re-labels it and re-folds correctly.
  - Editing a score award's `points` down to a smaller positive value updates the score.
  - Editing a score award's `points` to `0`/negative/non-integer is rejected (score intact).

### `deleteEvent(id)` (extended)

- Allowlist widened to include `team-turnover` and `team-score-adjust`.
- **Contract tests**
  - Deleting a team turnover restores `teamTurnovers`.
  - Deleting a score award restores `points`.

### `undoLastEvent()` (no change)

- Default tail-pop already reverses either new variant correctly (no derived on-court
  state). **Contract test**: recording then undoing a team turnover / score award returns
  the derived stat/score to its prior value (FR-011).

## Derived stats contract (`computeStats`)

- New field `TeamStats.teamTurnovers` initialized to `0`, `+1` per `team-turnover`.
- `TeamStats.points` gains `+points` per `team-score-adjust`.
- Player stat lines are untouched by either variant.
- **Contract tests** live in `packages/core/src/stats.test.ts`.

## Component contracts

### `TeamPanel` (changed)

```ts
interface TeamPanelProps {
  side: Side;
  onPlayerTap: (playerId: string) => void;
  onSubstitutionClick: () => void;
  onTeamActionsClick: () => void;   // NEW
  onTimeoutClick: () => void;
  selectedPlayerId: string | null;
}
```

- Renders a **"Team Actions"** button positioned **between** the Sub and Timeout buttons
  (FR-001), styled consistently with the sibling controls.
- Button is enabled when `status ∈ {ready, live, timeout, period-break}`; disabled in
  `setup`/`finished`.
- Header displays the team's turnover total from `teamTurnovers` (FR-014).
- **Contract tests**: button exists and sits between Sub and Timeout in DOM order;
  clicking calls `onTeamActionsClick`.

### `TeamActionsModal` (new)

```ts
interface TeamActionsModalProps {
  open: boolean;
  onClose: () => void;
  side: Side | null;
  capturedClockAt: number | null;
}
```

- Title scoped to the team (e.g. `Team Actions — {team.name}`).
- **Turnover section**: one button per `TEAM_TURNOVER_KINDS` entry; each calls
  `recordTeamTurnover(side, kind, capturedClockAt ?? undefined)` then closes. Section
  disabled unless `status ∈ {live, timeout, period-break}`.
- **Score-award section**: a positive-integer number input + free-text reason input +
  Confirm. Confirm is disabled unless the amount parses to a positive integer. On confirm,
  calls `recordTeamScoreAdjust(side, points, reason, capturedClockAt ?? undefined)` then
  closes. Section enabled whenever the modal is open from `ready` onward.
- Dismiss without confirming makes no store mutation (FR-012).
- Resets its form when reopened for a different side (mirrors `SubstitutionModal`).
- **Contract tests**: turnover button records + closes; positive award records + closes;
  Confirm disabled for empty/0/negative/non-integer; cancel/backdrop makes no mutation;
  turnover section disabled in `ready`.

### `GameLog` (changed — `describe()`)

- `team-turnover` → text like `{TAG} — {label} violation (team TO)`, side-colored,
  `tag: "TO"`, muted.
- `team-score-adjust` → text like `{TAG} +{points}{reason ? " — " + reason : ""}`,
  side-colored, `tag: "+PTS"`, accent, emphasized.
- **Contract tests** in `GameLog.test.tsx` assert both descriptors, including reason
  omitted when blank.

### `EditEventModal` (changed)

- Supports editing the two new editable types (kind picker for turnover; points + reason
  for score award), reusing the existing modal shell. Points field rejects non-positive on
  submit (mirrors store guard).

### `app/game/page.tsx` (wiring)

- Adds `teamActionsSide` transient state + captured `clockAt` at button tap, passes
  `onTeamActionsClick` to each `TeamPanel`, and renders one `<TeamActionsModal/>`.
