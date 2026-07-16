# Phase 0 Research: Team Actions

All spec-level ambiguities were resolved during `/speckit.clarify` (see spec
Clarifications, Session 2026-07-16). No `NEEDS CLARIFICATION` markers remain in the
Technical Context. This document records the design decisions that shape Phase 1.

## Decision 1 — Model team actions as new `GameEvent` variants (not reuse `stat`/`score`)

**Decision**: Add two new discriminated-union variants to `GameEvent`:
`team-turnover` (carries `side`, `kind: TeamTurnoverKind`) and `team-score-adjust`
(carries `side`, `points: number`, `reason: string`).

**Rationale**: The existing `stat` (turnover) and `score` events **require** a
`playerId`, and `score` is constrained to `kind: "ft" | "2pt" | "3pt"`. Team actions
are, by definition, not attributed to a player, and a score award is an arbitrary
positive amount unrelated to a shot type. Overloading the existing variants would force
sentinel player IDs and fake shot kinds — a Principle II (type safety) and Principle V
(no misleading models) violation. Distinct variants keep `computeStats`, the play-by-play
descriptors, and edit/delete logic honest and exhaustive.

**Alternatives considered**:
- *Reuse `stat` with a nullable `playerId`*: rejected — makes `playerId` optional across
  all stat handling, weakening every existing consumer's types.
- *Reuse `score` with a synthetic player*: rejected — pollutes player box scores and
  FG% math; the award is a team-only quantity.
- *A single generic `team-action` variant with a `mode` field*: rejected — a
  turnover and a score award have disjoint payloads; two variants are clearer and let the
  compiler enforce field presence per case.

## Decision 2 — Enforce "additive-only" at the store boundary, including on edit

**Decision**: `recordTeamScoreAdjust` accepts only a positive integer `points`; a
non-positive or non-integer value is a no-op at the store (mirrors existing guard style,
e.g. `substitute` early-returns `s`). `editEvent` applies the same guard to any
`team-score-adjust` patch: a proposed `points` that is not a positive integer is rejected
(no-op). The UI additionally disables Confirm for non-positive input (defense in depth).

**Rationale**: FR-009 and SC-003 require that a team's score can *never* decrease through
Team Actions. The store is the single source of truth, so the invariant must hold there,
not only in the UI. Enforcing it on edit closes the "edit +5 down to −5" loophole while
still allowing correction downward to a smaller positive value or deletion (per FR-015).

**Alternatives considered**:
- *UI-only validation*: rejected — a stale/replayed action or a future caller could post a
  negative; the invariant belongs at the boundary.
- *Clamp negatives to 0*: rejected — silently accepting a 0-point award produces a
  meaningless log entry; a no-op is the honest behavior.

## Decision 3 — Extend edit/delete via the existing feature-004 mechanism

**Decision**: Add both new variants to the `EditableEvent` union and add matching
branches to `EditEventPatch`, `editEvent`, and the `deleteEvent` allowlist. No new
correction flow is introduced.

**Rationale**: Clarification chose "editable and deletable, like existing events." The
feature-004 machinery (`editEvent`/`deleteEvent` + `EditEventModal`/`DeleteEventConfirmModal`)
already does exactly this for score/foul/stat/timeout. Reusing it is DRY (Principle V) and
keeps play-by-play behavior consistent (SC-004). `undoLastEvent` needs no special case —
neither new variant carries derived on-court state (unlike `substitution`), so the default
tail-pop already restores correct stats via re-fold.

## Decision 4 — Surface team turnovers via a `teamTurnovers` field on `TeamStats`

**Decision**: Add `teamTurnovers: number` to `TeamStats`, incremented by the
`team-turnover` fold case, and display it in the TeamPanel header (alongside "Team fouls").

**Rationale**: FR-014 requires team-level turnovers to appear in team statistics, but
`TeamStats` currently tracks turnovers only per player. A dedicated team field keeps the
team-attributed count distinct from individual player turnovers (which remain untouched
per FR-005) and gives the header a concrete value to render. Stats stay fully derived from
events (store invariant #2), so no drift risk.

**Alternatives considered**:
- *Fold team turnovers into player turnover totals*: rejected — violates FR-005 (must not
  change any player's turnover total) and loses the team/player distinction.

## Decision 5 — State-gated availability inside one modal

**Decision**: A single `TeamActionsModal` hosts both sections. The score-award section is
enabled whenever `status ∈ {ready, live, timeout, period-break}`; the violation-turnover
section is enabled only when `status ∈ {live, timeout, period-break}`. The TeamPanel
"Team Actions" button is enabled from `ready` onward (because at least the score-award
path is available then). `clockAt` is captured at button tap (like `page.tsx` does for
player taps) so the recorded play time reflects when the action happened.

**Rationale**: Clarification Q3 chose "score awards from `ready` onward; turnovers
live/break-only." A single modal with two independently gated sections is simpler than two
entry points and keeps the button placement requirement (FR-001) intact. `finished` is
excluded per the clarified scope.

**Alternatives considered**:
- *Two separate buttons/modals*: rejected — clutters the 3-button footer and contradicts
  the single "Team Actions" entry point in the spec.

## Decision 6 — Extensible violation set as a `constants.ts` list

**Decision**: Define `TEAM_TURNOVER_KINDS` (with display labels) in
`packages/core/src/constants.ts`, seeded with the three required kinds (8-second,
24-second, 3-second) plus a couple of common extras (5-second, backcourt). The modal
renders one button per entry, and `GameLog` labels from the same map.

**Rationale**: FR-004 requires the three named kinds and a structure that admits more. A
single source-of-truth list keeps the modal, the log descriptors, and the `TeamTurnoverKind`
union in sync and makes adding a kind a one-line change (DRY, Principle V).
