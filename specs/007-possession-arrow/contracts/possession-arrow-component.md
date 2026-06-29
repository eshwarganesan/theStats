# Contract: `<PossessionArrow>` Component

**File**: `packages/web/src/components/game/PossessionArrow.tsx`
**Test file**: `packages/web/src/components/game/PossessionArrow.test.tsx`

## Purpose

A pure presentational component that renders the alternating-possession arrow indicator. Receives all state via props. Owns no Zustand subscriptions, no data-fetching, no side-effects beyond invoking the `onCycle` prop.

This is **the** reusable component the user input called for. Scoreboard wraps it with store logic; the component itself is dumb and decoupled from the app state shape.

## Props

```ts
import type { PossessionArrowDirection } from "@thestats/core";

export interface PossessionArrowProps {
  /** Current direction. Drives both icon orientation and ARIA label. */
  direction: PossessionArrowDirection;
  /** Called when the user taps/clicks/keyboard-activates the indicator.
   *  Caller is responsible for advancing the cycle (typically by calling
   *  the store's `cyclePossessionArrow` action). NOT called when
   *  `disabled` is true. */
  onCycle: () => void;
  /** When true, the indicator renders dimmed (reduced opacity) and is
   *  non-interactive (taps and keyboard activation do not fire `onCycle`).
   *  Used for `status === 'finished'`. Defaults to `false`. */
  disabled?: boolean;
  /** Optional className override for layout positioning by the parent
   *  (e.g. Scoreboard). Merged via `cn`. */
  className?: string;
}
```

## Rendering contract

| Direction | Visual content | `aria-label` |
|-----------|----------------|--------------|
| `'unset'` | Both arrow glyphs rendered, both dimmed; no team highlighted | `"Possession arrow: unset"` |
| `'home'`  | Glyph pointing toward the home team (left), accent color | `"Possession arrow: home"` |
| `'away'`  | Glyph pointing toward the away team (right), accent color | `"Possession arrow: away"` |

- Root element: `<button type="button">` (keyboard-operable per Decision 8).
- Minimum touch target: 44×44 pt (FR-003); enforced with explicit Tailwind `min-w-[44px] min-h-[44px]` plus padding for visual breathing room.
- When `disabled === true`: Tailwind `opacity-50`, `cursor-not-allowed`, `aria-disabled="true"`. Tap and keyboard activation MUST NOT call `onCycle`.
- Icon: Unicode glyphs `◀` (home) and `▶` (away), styled via Tailwind utility classes. No new icon library (Decision 7).

## Behavior contract

| Trigger | Behavior |
|---------|----------|
| Mouse click | Invoke `onCycle()` (unless `disabled`). |
| Touch tap | Invoke `onCycle()` (unless `disabled`). |
| Keyboard Enter or Space while focused | Invoke `onCycle()` (unless `disabled`). Native `<button>` behavior — no custom keydown handler required. |
| Rapid double-tap | Each tap fires `onCycle` independently — no debounce (spec Edge Cases). |

The component MUST NOT:
- Read from or write to the Zustand store directly.
- Mutate any DOM outside its own render tree.
- Persist anything to localStorage.
- Track any internal state — `direction` is fully controlled by the parent.

## Test contract (Vitest + Testing Library)

The Vitest spec MUST exercise:

1. **Three rendered states**: each of `'unset' | 'home' | 'away'` renders the expected `aria-label` and the expected visual class signal (e.g. accent text for the active side).
2. **`onCycle` fires on click**: render with `direction='home'`, click, assert `onCycle` called exactly once.
3. **`onCycle` fires on Enter key**: render, focus button, press Enter, assert `onCycle` called once.
4. **`onCycle` fires on Space key**: same as above with Space.
5. **`disabled` suppresses `onCycle`**: render with `disabled={true}`, click, assert `onCycle` NOT called. Also assert `aria-disabled="true"`.
6. **`disabled` adds dimmed visual class**: assert the rendered button has `opacity-50` (or the equivalent token in the design system).
7. **Touch target ≥ 44×44**: assert the rendered button has the `min-w-[44px]` / `min-h-[44px]` class (or computed style if practical).
8. **`className` prop is merged** into the root, not replacing base classes.

Each test starts from a failing state (Principle I — Red → Green → Refactor).

## Non-goals

- The component does NOT know about home / away team names or colors — it only knows orientation. Theming is via Tailwind tokens already used by Scoreboard.
- The component does NOT enforce the FR-006 cycle — that lives in the store action (see `store-cycle-action.md`).
- The component does NOT gate on `settings.possessionArrowEnabled` — Scoreboard does the gating and simply does not render the component when the toggle is off.
