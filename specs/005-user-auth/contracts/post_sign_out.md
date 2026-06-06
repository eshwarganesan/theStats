# Contract: POST /api/auth/sign-out

**Spec FRs**: FR-010, US3 acceptance scenarios
**Route handler file**: `packages/web/src/app/api/auth/sign-out/route.ts`
**Auth required**: Yes (no-op for unauthenticated callers, still 204)

## Request

```http
POST /api/auth/sign-out
```

No body. The session cookies identify the caller.

## Behavior

1. Read session via `createServerClient(...)`.
2. If a session exists, call `supabase.auth.signOut()` which invalidates
   the refresh token server-side and clears the cookies on the response.
3. If no session exists, no-op (still respond 204).
4. `logAuthEvent("sign-out", userIdOrNull, "ok", requestId)`.

## Responses

### 204 No Content

Empty body. Cookies cleared.

### 500 internal_error

```json
{ "error": { "code": "internal_error", "message": "Something went wrong." } }
```

## Integration tests (mandatory)

`tests/integration/auth/sign-out.test.ts` MUST cover:

- Signed-in caller → 204; cookies cleared; a subsequent authenticated
  request without re-auth fails.
- Unauthenticated caller → 204; no error.
- Sign-out on one cookie set does not invalidate another device's
  session (concurrent-session spec assumption).
