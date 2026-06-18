# Contract: `<StorageUnavailableModal />`

**Branch**: `006-preserve-game-state-on-refresh`

A presentational Client Component rendered at the root layout. Renders nothing when `localStorage` is available. Renders a blocking modal overlay when it is not.

## Location

`packages/web/src/components/shell/StorageUnavailableModal.tsx`

Mounted once at `packages/web/src/app/layout.tsx` (root layout) so it covers every route — home, setup, game.

## Behavior

- On mount, calls `isStorageAvailable()` from `lib/persistence.ts`. Caches the result for the lifetime of the page.
- When the result is `false`, renders a modal overlay with:
  - Title: "Saving is disabled"
  - Body: a brief explanation that the browser is blocking persistent storage (e.g., private browsing) and that any game started in this session will be lost on refresh.
  - A single primary action: "Continue without saving" — closes the modal for the rest of the page lifetime.
- The modal traps focus, has an `aria-modal="true"` dialog role, and renders an opaque backdrop that prevents underlying interaction (Principle IV accessibility).
- The acknowledgment is **not persisted** — every reload re-probes and, if storage is still unavailable, re-shows the modal. (Persisting the acknowledgment in the very storage that's broken would be incoherent; persisting in `sessionStorage` can fail in the same Safari private-mode path.)

## Props

None. The component reads availability from the persistence module directly. Stateless from the parent's perspective.

## Accessibility requirements

- `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing at the title, `aria-describedby` pointing at the body.
- Focus moves to the "Continue without saving" button on open.
- Escape key dismisses (treated as acknowledgment).
- Keyboard-trap inside the modal until dismissed.
- Color contrast meets WCAG 2.1 AA (per Principle IV constitution clause).

## Test surface (Vitest + Testing Library)

- Renders nothing when `isStorageAvailable()` returns `true`.
- Renders the dialog when it returns `false`.
- Clicking "Continue without saving" hides the modal.
- Pressing Escape hides the modal.
- After hide, re-mounting the component without a page reload does **not** re-show it (the acknowledgment is per-page-lifetime).

## Out of scope (not part of this contract)

- Internationalization of the copy (the app has no i18n layer yet).
- A "Help me fix this" link to a docs page (no docs page exists).
- Differentiating Safari private mode from other failure modes — the user-facing message is identical either way.
