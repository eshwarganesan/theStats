# Contract: `ClockAdjuster` component

**File**: [packages/web/src/components/game/ClockAdjuster.tsx](../../../packages/web/src/components/game/ClockAdjuster.tsx) (new)
**Surface**: A client component composed inside `GameClock`. Has no public props.

## Purpose

Surface the typed `mm:ss` editor and ±1s nudge controls that drive the store's `adjustClock` action. Owns the transient "adjustment session" state required for nudge coalescing; commits to the store as a single call per settled session.

## Render contract — visibility gating

The component MUST render `null` when EITHER of the following is true:

- `state.status !== "live"`
- `state.clockRunning === true`

Both reads MUST use Zustand selector subscriptions so the component re-renders only on transitions of those two fields, not on every clock tick.

When BOTH conditions are false (game live AND clock paused), the component renders three controls:

1. **Typed editor** — replaces the displayed clock digits when the user clicks/taps them. Implemented as `<input type="text" inputMode="numeric" pattern="[0-9:]*" maxLength={5}>` with the current `clockSeconds` formatted as `mm:ss`.
2. **`−1s` button** — labeled `−1s`. Disabled when `clockSeconds === 0`.
3. **`+1s` button** — labeled `+1s`. Disabled when `clockSeconds === currentPeriodMax`.

## Behavior — typed editor

| Trigger | Behavior |
|---------|----------|
| User clicks/taps the displayed clock digits | Switches the digits to an editable field, pre-filled with the current `mm:ss` value, with the field selected. |
| User types | Updates the field's local value. The store is NOT touched on each keystroke. |
| User presses `Enter` | Calls `parseClock(value)`. If non-null, calls `adjustClock(parsed)`. If null, exits edit mode and discards the input. The clock displays the new (or unchanged) value. |
| User blurs the field (taps elsewhere) | Same as Enter. |
| User presses `Escape` | Exits edit mode and discards the input. The clock displays the unchanged value. |
| User opens any other modal/dialog while editing | Same as Escape — the edit is discarded. |

## Behavior — nudge buttons + coalescing

The component holds two pieces of local state during a nudge session:

```ts
const [pendingFrom, setPendingFrom] = useState<number | null>(null);
const debounceRef = useRef<number | null>(null);
```

| Trigger | Behavior |
|---------|----------|
| First `−1s` or `+1s` tap (no session in progress) | Capture `pendingFrom = state.clockSeconds`. Optimistically update the visible clock value via local state OR call `adjustClock` and rely on the store, but emit no event yet — see "Implementation note" below. Schedule a debounce timer for 1500 ms. |
| Subsequent nudge tap within 1500 ms | Reset the debounce timer. Update the in-flight session value. |
| Debounce fires | Commit the session: call `adjustClock(currentSessionValue)` once. Clear `pendingFrom` and the debounce ref. |
| User opens the typed editor | Commit the session immediately. |
| User starts the clock (e.g., taps Play in `ActionPad`) | Commit the session immediately. |
| `clockRunning` transitions to `true` for any reason | Commit the session immediately and tear down the debounce. |

**Implementation note**: There are two equally valid ways to make the visible clock follow the in-progress nudges before the store commits. (a) Hold the running session value in component state and render that value over `clockSeconds` until commit; (b) call `adjustClock` on each tap and accept the per-tap event emission as the price of immediate visual feedback. Option (a) satisfies SC-006 cleanly and is the recommended path; option (b) would require a follow-up "merge consecutive adjust events" pass at the store level which we explicitly rejected in research.md decision 2. Default to (a).

## Accessibility (FR-012)

- The clock digits, when interactive, MUST have `role="button"` (or be a real `<button>`) with an accessible name like "Adjust clock time".
- The typed editor MUST have an associated label (visible or `aria-label="Clock time, minutes and seconds"`).
- The nudge buttons MUST be reachable in the natural tab order: clock-digits-as-button → −1s → +1s.
- Keyboard contract: `Tab` to focus, `Space`/`Enter` to activate. `Escape` cancels an open typed editor.
- Color contrast for the editable state and disabled-button states MUST meet WCAG 2.1 AA (the constitution's standard).
- The component MUST NOT rely on hover-only affordances (constitution IV).

## Layout / responsiveness

- At ≥ 480px the typed editor (in place of the clock) is centered with the two nudge buttons inline to its right.
- At < 480px the nudge buttons stack below the clock display.
- No layout shift when toggling between display and edit mode (the input must occupy the same width as the formatted clock).

## Test surface (Vitest + Testing Library, in `ClockAdjuster.test.tsx`)

| # | Test | Asserts |
|---|------|---------|
| 1 | renders nothing when status is not live | `setup`, `ready`, `period-break`, `finished` all render `null` |
| 2 | renders nothing when clock is running | After `startClock()`, the editor and nudge buttons are absent |
| 3 | renders editor + nudges when live and paused | All three controls present |
| 4 | tap on clock enters edit mode | The `mm:ss` input is rendered, focused, with the current value selected |
| 5 | typed entry on Enter calls adjustClock with parsed seconds | A typed `5:00` produces `adjustClock(300)`; the clock displays `5:00` |
| 6 | typed entry on blur calls adjustClock | Same as above triggered by blur |
| 7 | invalid typed entry preserves prior value | Typing `abc` then Enter leaves `clockSeconds` unchanged and no event is emitted |
| 8 | Escape discards an in-progress edit | `clockSeconds` and event count both unchanged |
| 9 | nudge `+1s` increments the displayed value optimistically | Visible value shows `prev + 1` immediately; no event yet |
| 10 | rapid nudges within 1500 ms emit one event | 5 `+1s` taps in 200 ms intervals → one `clock/adjust` event with `to === from + 5` |
| 11 | nudge then 1500 ms idle commits the session | After idle, exactly one event is appended |
| 12 | starting the clock commits an in-flight session | Tapping Play during a nudge session emits the event before the store transitions to running |
| 13 | nudge `+1s` is disabled at currentPeriodMax | `disabled` attribute set; clicking it does not change state |
| 14 | nudge `−1s` is disabled at 0 | Same |
| 15 | a11y: editor has accessible name | `aria-label` present and includes "minutes and seconds" |
| 16 | a11y: nudge buttons are reachable by Tab and activated by Enter / Space | Standard button keyboard contract |

## Out-of-scope for this contract

- Confirmation modal for large jumps (deferred from `/speckit.clarify`).
- Internationalization of the `mm:ss` separator.
- Visual styling beyond what the existing Tailwind/`cn` system provides (no new design tokens).
