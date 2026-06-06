# Contract: GET /auth/callback

**Spec FRs**: FR-005, FR-009 (redirect-after-confirm)
**Route handler file**: `packages/web/src/app/auth/callback/route.ts`
**Auth required**: No (this IS the authentication side-channel)

## Request

```http
GET /auth/callback?code=<one-time-code>&next=<relative-path>?
```

Supabase appends `code`. `next` may be passed through from
`emailRedirectTo` when the original sign-up included one.

### Validation

- `code` — required, non-empty string. If missing → redirect to
  `/login?error=missing_code`.
- `next` — optional; must be a relative path beginning with `/` (same
  open-redirect guard as `signUpInput.next`). If invalid → fall back to
  `/`.

## Behavior

1. Read `code` & `next` from `URL`.
2. Call `supabase.auth.exchangeCodeForSession(code)`. This both sets the
   session cookies on the response and marks `auth.users.email_confirmed_at`.
3. On success → HTTP **303 See Other** to `next || "/"`.
4. On failure → **303 See Other** to `/login?error=confirmation_failed`.
5. `logAuthEvent("callback", userIdOrNull, outcome, requestId)`.

## Responses

### 303 See Other

```http
Location: /
```

or

```http
Location: /login?error=confirmation_failed
```

## Integration tests (mandatory)

`tests/integration/auth/callback.test.ts` MUST cover:

- Valid code → 303 to `/`; `auth.users.email_confirmed_at` set;
  session cookies set.
- Valid code with `next: "/some/path"` → 303 to `/some/path`.
- Open-redirect guard: `next: "https://evil.com"` → 303 to `/` (fallback).
- Expired/invalid code → 303 to `/login?error=confirmation_failed`; no
  cookies set; `email_confirmed_at` untouched.
- Missing `code` query param → 303 to `/login?error=missing_code`.
