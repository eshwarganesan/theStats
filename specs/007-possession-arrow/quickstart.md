# Quickstart: Possession Arrow

**Feature**: 007-possession-arrow
**Audience**: A developer (or a future agent) about to implement this feature, or a reviewer about to verify it manually.

This document walks through the smallest end-to-end manual verification of the feature, plus a fast loop for local development. It mirrors the four acceptance scenarios from the spec.

---

## Local setup

From the repo root:

```bash
npm install
npm run dev --workspace packages/web
```

Open `http://localhost:3000`. The home page should render with a "New Game" entry point.

---

## Manual verification flow

### 1. 5v5: toggle is on by default; arrow is visible and tappable

1. Click **New Game** from the home page.
2. On the setup page, leave `Format = 5v5`. In the **Game Settings** row, locate the **Possession arrow** toggle — `On` should be highlighted (active).
3. Complete setup with default teams and click **Start Game**.
4. On the live game screen, locate the indicator inside the center column of the scoreboard, directly **below the clock**. It should be visible in the **unset** state (both home and away arrow glyphs dimmed, no accent color).
5. **Tap the indicator once.** The arrow should now point **left (home)** with accent color. The clock, score, period, and any other state MUST be unchanged.
6. **Tap again.** The arrow should flip to **right (away)**.
7. **Tap a third time.** The arrow should flip back to **left (home)**. (It MUST NOT return to the unset state.)

### 2. 3v3: toggle defaults to off; arrow is not rendered

1. From the home page, click **New Game**.
2. On the setup page, switch `Format` to `3v3`. The **Possession arrow** toggle should automatically flip to `Off` (cascade from `DEFAULT_SETTINGS['3v3']`).
3. Complete setup and click **Start Game**.
4. On the live game screen, **no possession-arrow indicator should be present** anywhere. The clock, period eyebrow, and team panels should look exactly as they did before this feature.

### 3. Refresh restores the arrow direction

1. Start a 5v5 game with the toggle on.
2. Tap the indicator twice so it points **right (away)**.
3. **Refresh the browser** (`Cmd+R` / `Ctrl+R`).
4. After the page reloads and the game state restores (via the feature-006 persistence layer), the indicator should still point **right (away)**.
5. Click around — Stats page, back to the live screen — the direction should remain stable.

### 4. Finished-game treatment

1. Start a 5v5 game with the toggle on; flip the arrow to **left (home)**.
2. Run the clock to 0 in the last regulation period, end the period, and let the game finalize (with a non-tied score so OT does not trigger).
3. On the now-finished live screen, the indicator should remain visible pointing **left (home)** but **dimmed** (reduced opacity, signaling disabled).
4. **Tap the dimmed indicator.** Nothing should change — the arrow stays pointing left.

### 5. Stats / Scoresheet pages do NOT show the arrow

1. From a game with the arrow set to **right (away)**, navigate to the **Stats** page.
2. Confirm there is no possession-arrow indicator anywhere on the Stats page.
3. Navigate to the **Scoresheet** page.
4. Confirm there is no possession-arrow indicator on the Scoresheet.
5. Return to the live game screen — the arrow should still be visible there, still pointing away.

---

## Automated checks

Run before opening a PR:

```bash
npm run typecheck          # Principle II
npm run lint               # Principle V
npm run test               # Vitest unit + component (Principle I)
npm run test:e2e           # Playwright E2E (acceptance scenarios)
```

The Playwright suite for this feature is `packages/web/tests/e2e/possession-arrow.spec.ts`. It covers all four manual scenarios above; the Vitest suites cover the store action, the default cascade, the persist round-trip, and the `<PossessionArrow>` component contract.

---

## Quickstart troubleshooting

- **Indicator not visible on 5v5**: confirm `settings.possessionArrowEnabled === true` in the Zustand devtools or by inspecting localStorage `thestats.game.v1`. If the toggle defaulted off, check `DEFAULT_SETTINGS['5v5']` in `packages/core/src/constants.ts`.
- **Indicator visible on 3v3**: the scorekeeper may have manually flipped the toggle `On` in setup — that's expected behavior, not a bug.
- **Refresh does not restore direction**: check that `possessionArrow` is included in the `partialize` selector in `packages/web/src/lib/store.ts`. The feature-006 persistence layer relies on it.
- **Tapping has no effect**: confirm `status !== 'finished'`. Finished games dim the indicator and suppress `onCycle`.
