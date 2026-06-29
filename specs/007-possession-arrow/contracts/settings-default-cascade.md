# Contract: `possessionArrowEnabled` in Settings Defaults & Setup Toggle

**Files**:
- `packages/core/src/types.ts` — interface extension
- `packages/core/src/constants.ts` — `DEFAULT_SETTINGS` extension
- `packages/web/src/app/setup/page.tsx` — UI toggle wiring

**Test files**:
- `packages/core/src/` (existing test files for constants and types, if any) — assertion that `DEFAULT_SETTINGS['5v5'].possessionArrowEnabled === true` and `DEFAULT_SETTINGS['3v3'].possessionArrowEnabled === false`.
- `packages/web/src/app/setup/page.test.tsx` — toggle interaction tests (new file or extend existing).

## Type extension

Add to the existing `GameSettings` interface at `packages/core/src/types.ts:46`:

```ts
/** When `true`, the live game screen renders a tap-to-flip
 *  alternating-possession arrow indicator beside the clock. */
possessionArrowEnabled: boolean;
```

The interface MUST remain backward-compatible at the type level: every existing construction of a `GameSettings` value (in tests, fixtures, mocks) MUST be updated to include the new field. The TypeScript compiler enforces this — any miss is a build error.

## Defaults

Add to `DEFAULT_SETTINGS` at `packages/core/src/constants.ts:23`:

```ts
"5v5": {
  // …existing fields…
  possessionArrowEnabled: true,   // refereed 5v5 uses an alternating-possession arrow
},
"3v3": {
  // …existing fields…
  possessionArrowEnabled: false,  // FIBA 3x3 has no alternating-possession arrow concept
},
```

## Format cascade contract

When the scorekeeper changes `format` on the setup page, the existing `setSettings` cascade copies all fields from `DEFAULT_SETTINGS[newFormat]` (except `venue` and `competition`, which are preserved). `possessionArrowEnabled` MUST flow through that cascade automatically — no new logic in `setSettings`.

**Test (Vitest)**: setup-page or store-level test that starts in 5v5 (toggle on), switches format to 3v3, asserts `settings.possessionArrowEnabled === false`. Switching back to 5v5 asserts `true`.

## Setup-page UI contract

Add a new inline `PossessionArrowToggle` component in `app/setup/page.tsx`, modeled exactly after `OvertimeToggle` (the feature-003 sibling at `setup/page.tsx:258-285`). Place it in the **Game Settings** row, immediately after the `Overtime` On/Off pair, for visual continuity.

```tsx
/** Two-button On/Off toggle for the Possession arrow opt-in setting.
 *  Mirrors OvertimeToggle styling for visual consistency. */
function PossessionArrowToggle({
  value,
  active,
  onClick,
}: {
  value: "On" | "Off";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 h-11 text-sm font-mono uppercase tracking-widest transition-colors",
        "border first:border-r-0",
        active
          ? "border-accent bg-accent text-surface"
          : "border-surface-border bg-surface-raised text-ink-muted hover:text-ink",
      )}
      aria-pressed={active}
    >
      {value}
    </button>
  );
}
```

Wire the two buttons to `setSettings({ possessionArrowEnabled: true | false })`. Label the row "Possession arrow" with the same row-label style as the existing "Overtime" row.

## Test contract (Vitest — setup page)

Add to `app/setup/page.test.tsx` (create if absent; if present, extend):

1. **5v5 default renders On active** — render setup, format defaults to 5v5, assert the `On` button has `aria-pressed="true"` in the Possession arrow row.
2. **3v3 default renders Off active** — switch format to 3v3, assert the `Off` button has `aria-pressed="true"`.
3. **Clicking Off in 5v5 flips the setting** — click `Off`, assert the store's `settings.possessionArrowEnabled === false`.
4. **Clicking On in 3v3 flips the setting** — switch to 3v3, click `On`, assert `settings.possessionArrowEnabled === true`.
5. **Format cascade resets the toggle** — start in 5v5 with toggle off, switch to 3v3, switch back to 5v5, assert toggle is back to default (`true`).

Each test starts from a failing state (Principle I).

## Frozen-at-game-start contract

The new field MUST behave like every other `GameSettings` field after `prepareGame`: it is read-only from the live screen and the Stats / Scoresheet pages. There is no in-game UI for changing it. This is structurally enforced because the live screen does not import or call `setSettings`. No additional test is required beyond the existing "settings are frozen after prepareGame" coverage.
