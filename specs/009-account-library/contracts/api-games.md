# API Contract: Games Library

**Feature**: `009-account-library`
**Base path**: `/api/games`
**Auth**: Every endpoint requires a Supabase session cookie. The handler calls `createServerClient()` and `getUser()` first; on missing/invalid session it returns `401 { error: { code: "unauthenticated" } }`. Owner ID is derived from the verified session — the client MUST NOT send it in the body or query.

All responses use the error shape `{ error: { code: string, message: string } }` on any non-2xx status. Success responses use the shapes documented per endpoint.

Handlers structured-log on entry and exit per Constitution Principle VI, including request ID, handler name, authenticated user ID (if any), and outcome (status or error code).

---

## `GET /api/games`

Paginated list of the caller's library entries, ordered by `last_activity_at DESC`.

**Query params (Zod-validated)**:

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `cursor` | ISO datetime string, optional | none | The `lastActivityAt` of the tail entry from the previous page. Rows with `last_activity_at < cursor` are returned. |
| `limit` | integer `1..50`, optional | 20 | Batch size. |

**Success `200`**:

```jsonc
{
  "entries": [
    {
      "id": "8f9b...",                          // uuid
      "status": "in-progress",                  // 'in-progress' | 'finished'
      "homeTeamName": "Central HS Boys",
      "awayTeamName": "Eastridge Bulldogs",
      "homeScore": 42,
      "awayScore": 39,
      "eventCount": 128,
      "currentPeriod": 3,
      "startedAt": "2026-07-20T18:00:00Z",
      "lastActivityAt": "2026-07-20T20:14:03Z",
      "finishedAt": null
    }
  ],
  "nextCursor": "2026-07-15T19:30:00Z"          // null when the last page was returned
}
```

**Errors**: `400` `invalid_query_params`, `401` `unauthenticated`.

**RLS**: SELECT policy `owner_id = auth.uid()` — an authenticated user only ever sees their own rows.

---

## `POST /api/games`

Create a new saved game record — invoked either when a signed-in scorekeeper begins a new game or when the "Save to my account" branch of the anonymous-game-on-sign-in prompt uploads a local game.

**Required headers**:
- `Content-Type: application/json`
- `Idempotency-Key: <uuid>` — enforced via the `record_game_write` RPC. A duplicate key returns the existing row with `200` instead of a second insert.

**Request body (Zod-validated)**:

```jsonc
{
  "state": { /* PersistedGameRecord — same shape as feature 006's localStorage payload */ }
}
```

**Success `201`**:

```jsonc
{
  "game": {
    "id": "8f9b...",
    "ownerId": "…",
    "status": "in-progress",
    "homeTeamName": "…",
    "awayTeamName": "…",
    "homeScore": 0,
    "awayScore": 0,
    "eventCount": 0,
    "currentPeriod": 1,
    "startedAt": "2026-07-22T15:41:00Z",
    "lastActivityAt": "2026-07-22T15:41:00Z",
    "finishedAt": null,
    "state": { /* echoed PersistedGameRecord */ }
  }
}
```

**Idempotency replay `200`**: Same shape as `201`, but returns the previously created row.

**Errors**: `400` `idempotency_key_required`, `400` `invalid_body`, `401` `unauthenticated`, `500` `internal_error`.

**RLS**: INSERT policy `WITH CHECK (owner_id = auth.uid())`. The server sets `owner_id` from the session; the client cannot forge it.

---

## `GET /api/games/[id]`

Return the full record (including `state`) for one saved game. Used by:
- The "Continue" flow on `LibraryEntry.tsx` to hydrate the Zustand store before `router.push('/')` (Research R-07).
- The Server Component at `/account/games/[id]` for the review view of finished games.

**Success `200`**:

```jsonc
{
  "game": { /* SavedGameRecord — same shape as POST response */ }
}
```

**Errors**: `401` `unauthenticated`, `404` `not_found` (RLS-filtered — indistinguishable from "not yours"), `400` `invalid_id`.

**RLS**: SELECT policy `owner_id = auth.uid()`. A game belonging to another user returns `404`, not `403` — do not leak existence.

---

## `PATCH /api/games/[id]`

Write-through save of a mutated game state from the client. Called by `useLibraryWriteThrough` (Research R-01) after each debounced Zustand mutation.

**Required headers**:
- `Content-Type: application/json`
- `Idempotency-Key: <uuid>` — one key per client-side commit (the client can use `state.events[state.events.length - 1].id`).

**Request body (Zod-validated)**:

```jsonc
{
  "state": { /* PersistedGameRecord */ }
}
```

**Handler behavior**:
- Verifies session and RLS ownership (SELECT + UPDATE policies both apply).
- Checks the idempotency key via `record_game_write`; on duplicate, returns the current row without re-writing.
- Recomputes `status`, `home_team_name`, `away_team_name`, `home_score`, `away_score`, `event_count`, `current_period` from the incoming `state`. If `state.status === 'finished'`, sets `status = 'finished'` and `finished_at = now()`.
- `last_activity_at` is bumped by the DB trigger, not the handler.

**Success `200`**: Same shape as `POST`.

**Errors**: `400` `idempotency_key_required`, `400` `invalid_body`, `401` `unauthenticated`, `404` `not_found`, `409` `finished_game_locked` (if the client tries to PATCH a game whose stored `status` is already `finished` — the review view is read-only).

**Atomicity**: The idempotency check + UPDATE run inside a single Postgres statement flow (RPC or transaction) to prevent double-writes on retry.

---

## `DELETE /api/games/[id]`

Delete a saved game. The client is expected to have shown a confirmation dialog first (FR-025). For in-progress deletions, that dialog surfaces `eventCount` + `currentPeriod` (both available on the library entry without a separate fetch).

**Success `204`** (no body).

**Errors**: `401` `unauthenticated`, `404` `not_found` (RLS-filtered).

**RLS**: DELETE policy `owner_id = auth.uid()`. Cascade cleans up `game_writes` rows referencing this game.

---

## Error shape (universal)

```jsonc
{
  "error": {
    "code": "invalid_body",
    "message": "Body did not match the expected schema."
  }
}
```

`message` is user-facing but generic. Handlers MUST NOT include Postgres error text, stack traces, or internal IDs in the response. Full detail is emitted to structured logs only.

## Zod schemas (location)

All schemas live in `packages/web/src/lib/validation/games.ts`:

- `LibraryQuerySchema` — for `GET /api/games` query.
- `PersistedGameRecordSchema` — for the `state` field on POST / PATCH.
- `PostGameBodySchema` — `{ state: PersistedGameRecordSchema }`.
- `PatchGameBodySchema` — same shape as POST.

Each schema's inferred type (`z.infer<typeof ...>`) is used as the parameter type in the handler — no `as` casts, no `any`.
