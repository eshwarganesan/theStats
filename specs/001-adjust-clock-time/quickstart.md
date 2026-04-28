# Quickstart: Adjust Clock Time When Paused

**Feature**: 001-adjust-clock-time
**Audience**: A developer picking up this feature for implementation, code review, or QA.
**Prerequisites**: Working tree on branch `001-adjust-clock-time`, `npm install` already run from the repo root, working `packages/web/` dev server.

## 1. Run the existing test suite (baseline)

```bash
cd packages/web
npm run typecheck
npm test
```

All currently passing — establish the baseline before making any change.

## 2. Make the failing tests fail (TDD per Constitution I)

The order below mirrors the Phase 0 / Phase 1 designs and produces the smallest possible failing surface for each layer.

1. **Pure helper** — add the `parseClock` test cases from [data-model.md](data-model.md#parseclockinput-string-number--null) to `packages/web/src/lib/utils.test.ts`. Run `npm test utils` and watch them fail.
2. **Store action** — add the 12 cases from [contracts/store-action.md](contracts/store-action.md#test-surface-vitest-in-storetests) to `packages/web/src/lib/store.test.ts`. Run `npm test store` and watch them fail.
3. **Component** — add the 16 cases from [contracts/component-contract.md](contracts/component-contract.md#test-surface-vitest--testing-library-in-clockadjustertesttsx) to a new `ClockAdjuster.test.tsx`. Run `npm test ClockAdjuster` and watch them fail.
4. **End-to-end** — add `packages/web/tests/e2e/adjust-clock.spec.ts` exercising: start a 5v5 game → tip off → pause clock at any value → tap displayed clock → type `5:00` → press Enter → assert displayed clock and play-by-play row. Run `npm run test:e2e -- adjust-clock` and watch it fail.

## 3. Implement in the order that turns each test green

1. `parseClock` in `packages/web/src/lib/utils.ts` (turns step 2.1 green).
2. `GameEvent` `clock` variant union extension in `packages/web/src/lib/types.ts` (turns the type-only assertions in step 2.2 compilable).
3. `adjustClock` reimplementation in `packages/web/src/lib/store.ts` (turns step 2.2 green; also fixes the latent OT-cap defect documented in [research.md](research.md#decision-4--clamping-responsibility-lives-in-the-store-not-the-component)).
4. `ClockAdjuster` component in `packages/web/src/components/game/ClockAdjuster.tsx` plus a one-line composition change in `GameClock.tsx` (turns step 2.3 green).
5. `GameLog.tsx` render branch for `action: "adjust"` (refines the visible play-by-play row).
6. End-to-end spec turns green (step 2.4).

## 4. Verify the constitution gates

```bash
cd packages/web
npm run test:all
```

Must pass: `typecheck`, `lint`, `test:coverage`, `test:e2e`. Coverage on `store.ts`, `utils.ts`, and `components/game/ClockAdjuster.tsx` MUST be the new minimum, not lower than baseline.

## 5. Manual smoke (per Constitution IV — "test the UI")

1. `npm run dev` from `packages/web/`.
2. Set up a 5v5 game and tip off.
3. Tap Play in the ActionPad. Verify the clock starts counting down.
4. Tap Pause. Verify the clock stops AND the new editor + nudge controls appear.
5. Tap the clock digits. Type `5:00`. Press Enter. Verify the clock shows `5:00` and the play-by-play log shows a "Clock adjusted" entry.
6. Tap `+1s` six times in two seconds. Verify the displayed clock increments to `5:06` and (after a brief pause) ONE additional play-by-play entry appears with `5:00 → 5:06`.
7. Tap `−1s` until the clock reaches `0:00`. Tap the End Period prompt that appears, then back out — instead, tap the clock digits and type `0:08`. Verify the End Period prompt disappears and the period continues.
8. Tap Play. Verify the clock resumes counting down from the adjusted value.

If any step fails, fix and re-run from step 1 of this section before declaring done.

## 6. Files touched (final checklist before opening the PR)

- `packages/web/src/lib/types.ts` — `GameEvent` `clock` variant gains `"adjust"` member with `from`/`to`.
- `packages/web/src/lib/store.ts` — `adjustClock` reimplemented (gating, period-aware clamp, event emission, no-op short-circuit).
- `packages/web/src/lib/store.test.ts` — 12 new cases per the store contract.
- `packages/web/src/lib/utils.ts` — new `parseClock` helper.
- `packages/web/src/lib/utils.test.ts` — `parseClock` cases.
- `packages/web/src/components/game/ClockAdjuster.tsx` — NEW.
- `packages/web/src/components/game/ClockAdjuster.test.tsx` — NEW.
- `packages/web/src/components/game/GameClock.tsx` — composes `ClockAdjuster`.
- `packages/web/src/components/game/GameClock.test.tsx` — composition assertion.
- `packages/web/src/components/game/GameLog.tsx` — render branch for `action: "adjust"`.
- `packages/web/src/components/game/GameLog.test.tsx` — snapshot of new entry.
- `packages/web/tests/e2e/adjust-clock.spec.ts` — NEW.

PR description MUST call out (a) the OT-cap defect fix in `adjustClock`, (b) the rationale for the union-member redesign of the `clock` event variant, and (c) confirmation that bundle delta is < 1 KB gzipped (run `npm run size`).
