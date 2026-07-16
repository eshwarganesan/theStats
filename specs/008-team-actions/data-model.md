# Phase 1 Data Model: Team Actions

The app is event-sourced: statistics are never stored, only folded from the `events`
array (`packages/core/src/stats.ts`). This feature adds two `GameEvent` variants, one
supporting literal-union type, and one derived field on `TeamStats`. All shapes live in
`packages/core/src/types.ts` unless noted.

## New literal union — `TeamTurnoverKind`

```ts
/** Team-attributed violation turnovers (not charged to a player). */
export type TeamTurnoverKind =
  | "8-second"   // backcourt / advance violation
  | "24-second"  // shot-clock violation
  | "3-second"   // offensive lane (in-the-key) violation
  | "5-second"   // closely-guarded / inbound violation
  | "backcourt"; // over-and-back violation
```

- The three named kinds (`8-second`, `24-second`, `3-second`) are **required** (FR-004);
  the remaining entries satisfy the "structured so additional types can be offered"
  clause. The list is defined once as `TEAM_TURNOVER_KINDS` in `constants.ts` with display
  labels, and the union is derived from / kept in sync with it.

## New `GameEvent` variant — Team Turnover

```ts
{
  type: "team-turnover";
  id: ID;
  timestamp: number;
  period: number;
  clockAt: number;      // captured at button tap
  side: Side;           // team charged with the turnover
  kind: TeamTurnoverKind;
}
```

**Validation / rules**
- No `playerId` — team-attributed by construction (FR-003, FR-005).
- Recorded only when `status ∈ {live, timeout, period-break}` (FR-016). The store does not
  hard-block on status (it trusts the gated UI), but the modal disables the section
  otherwise.
- Contributes `+1` to the charged team's `teamTurnovers` (FR-005, FR-014); touches no
  player stat line.

## New `GameEvent` variant — Team Score Adjustment

```ts
{
  type: "team-score-adjust";
  id: ID;
  timestamp: number;
  period: number;
  clockAt: number;      // captured at button tap
  side: Side;           // team awarded the points
  points: number;       // positive whole number, > 0
  reason: string;       // free-text; may be "" (blank)
}
```

**Validation / rules**
- `points` MUST be a positive integer (`Number.isInteger(points) && points > 0`).
  `recordTeamScoreAdjust` and `editEvent` both reject anything else as a no-op
  (FR-008, FR-009, FR-015, SC-003). There is **no** code path to a non-positive value.
- `reason` is free-text (Clarification Q2); blank allowed. Rendered in the play-by-play
  when non-empty (FR-010).
- Contributes `+points` to the awarded team's `points` (FR-008); touches no player's
  points (FR-007).
- Available from `status === "ready"` onward (FR-016).

## Extended union — `EditableEvent`

Add both new variants so they participate in feature-004 edit/delete (FR-015, Clarification Q1):

```ts
export type EditableEvent =
  | Extract<GameEvent, { type: "score" }>
  | Extract<GameEvent, { type: "foul" }>
  | Extract<GameEvent, { type: "stat" }>
  | Extract<GameEvent, { type: "timeout" }>
  | Extract<GameEvent, { type: "team-turnover" }>
  | Extract<GameEvent, { type: "team-score-adjust" }>;
```

## Extended union — `EditEventPatch`

Add branches with the editable fields per variant (identity fields remain immutable):

```ts
| { type: "team-turnover"; clockAt?: number; side?: Side; kind?: TeamTurnoverKind }
| { type: "team-score-adjust"; clockAt?: number; side?: Side; points?: number; reason?: string }
```

- A `team-score-adjust` patch whose resolved `points` is not a positive integer is
  rejected by `editEvent` (no-op), preserving the additive-only invariant on edit.

## Modified aggregate — `TeamStats`

Add one derived field:

```ts
export interface TeamStats {
  side: Side;
  points: number;         // now also includes team-score-adjust awards
  fouls: number;
  totalFouls: number;
  timeoutsTaken: number;
  timeoutsRemaining: number;
  teamTurnovers: number;  // NEW — count of team-attributed violation turnovers
  players: PlayerStats[];
}
```

- Initialized to `0` in the `make(...)` factory in `computeStats`.
- `points` gains the additive award in the new `team-score-adjust` fold case; player
  `points` are unaffected.

## Fold additions (`computeStats`)

```text
case "team-turnover":      stats[ev.side].teamTurnovers += 1;
case "team-score-adjust":  stats[ev.side].points += ev.points;
```

Both are pure additions to the existing `switch (ev.type)`; the compiler's exhaustiveness
check forces these cases once the union grows (Principle II benefit).

## Persistence impact

The two new variants ride the existing persisted `events` array (`persist` partialize in
`store.ts`, key `thestats.game.v1`). They are additive and backward-compatible: a game
saved before this feature simply contains none, and `parseGameRecord` continues to accept
the array. **No `schemaVersion` bump required.** No Supabase / server state.

## Entity relationship summary

| Entity | Kind | Attributes | Contributes to |
|--------|------|------------|----------------|
| Team Turnover Action | `GameEvent` variant | side, kind, period, clockAt | `TeamStats.teamTurnovers` (+1) |
| Team Score Adjustment | `GameEvent` variant | side, points (>0), reason (free-text), period, clockAt | `TeamStats.points` (+points) |
| `TeamStats.teamTurnovers` | Derived field | integer count | Team statistics display (FR-014) |
