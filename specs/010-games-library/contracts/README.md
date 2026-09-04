# Phase 1 — Contracts: Games Page (Sidebar Library + New Game Entry)

**Feature**: `010-games-library` | **Plan**: [../plan.md](../plan.md)

## No new external interfaces

This feature exposes no new HTTP endpoints, no new server actions, no new RPCs, no new CLI commands, and no new library APIs. Per the plan's Constitution Check (Principle VI row), the Games page and its per-game detail route are Server Components that read Supabase directly via the SSR client — the same pattern the current `/account` and `/account/games/[id]` pages use — and the auth gate is `requireAuth`, not a new endpoint.

Downstream tooling (contract tests, API documentation generation) has nothing to enumerate for this feature. This file exists so `contracts/` is not empty and so future readers do not go looking for a missing spec.

## Reused external interfaces (unchanged)

The Games page and its per-game route consume the following existing routes and RPCs delivered by feature 009. They are listed here for traceability only. The canonical contracts live with feature 009 and are re-exercised by that feature's integration and E2E tests plus this feature's Playwright specs (see `../research.md#r-06`).

### HTTP

| Method | Path | Consumed by | Contract source |
|-------|------|------------|-----------------|
| `GET` | `/api/games?cursor=&limit=` | `<GameLibrary>` client `loadMore()` (moved to `src/components/games/`) | `packages/web/src/app/api/games/route.ts` — request validated by `LibraryQuerySchema`; response shape `LibraryPage` (`{ entries: LibraryEntry[]; nextCursor: string \| null }`); auth via `withAuthenticatedHandler`; RLS on `public.games`. |
| `GET` | `/api/games/[id]` | `<LibraryEntry>` client "Continue" flow (moved to `src/components/games/`) | `packages/web/src/app/api/games/[id]/route.ts` — response shape `{ game: SavedGameRecord }`; RLS-enforced ownership; 404 for non-owner or missing id. |
| `DELETE` | `/api/games/[id]` | `<DeleteGameDialog>` (moved to `src/components/games/`) | Same route file. Idempotency via `game_writes` unchanged. |

The new Server Components (`src/app/(authenticated)/games/page.tsx` and `src/app/(authenticated)/games/[id]/page.tsx`) do **not** call the HTTP handlers — they read the same `public.games` rows directly via `createServerClient()` for the initial paint, mirroring the existing `packages/web/src/app/(authenticated)/account/page.tsx` pattern. The HTTP handlers remain reachable for the already-hydrated `<GameLibrary>` client (pagination) and `<LibraryEntry>` client (open + delete) code paths.

### Database RPCs

| RPC | Consumed by | Contract source |
|-----|------------|-----------------|
| `record_game_write(p_key, p_game_id)` | `POST /api/games` — invoked when `/setup` finalizes a new game | `supabase/migrations/0002_account_library.sql` |
| `get_game_write_game_id(p_key)` | Same route, duplicate-key retry path | Same migration |

Neither RPC is invoked from a surface this feature adds.

### Route-level redirect (new — not an interface, but a routing rule)

Declared in `next.config.mjs`:

```js
{ source: "/account/games/:id", destination: "/games/:id", permanent: true }
```

Exists to preserve external bookmarks per FR-021 / SC-004. Asserted by `tests/e2e/games-redirect.spec.ts` (see research R-06).
