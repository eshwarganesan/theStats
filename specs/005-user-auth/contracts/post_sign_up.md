# Contract: POST /api/auth/sign-up

**Spec FRs**: FR-002, FR-003, FR-004, FR-005, FR-012, FR-013, FR-015
**Route handler file**: `packages/web/src/app/api/auth/sign-up/route.ts`
**Auth required**: No

## Request

```http
POST /api/auth/sign-up
Content-Type: application/json
```

```json
{ "email": "string", "password": "string", "next": "string?" }
```

### Validation (Zod — `signUpInput` in `lib/auth/schemas.ts`)

| Field | Rule |
|---|---|
| `email` | trimmed, lowercased, valid RFC 5322-ish email, ≤254 chars |
| `password` | non-empty string. **No length/complexity rule applied client-side or server-side beyond the auth provider's defaults** (Clarification Q2 / R5). |
| `next` | optional; must be a relative path beginning with `/` (open-redirect guard); ≤512 chars |

## Behavior

1. Parse body with `signUpInput`. On failure → **400 invalid_input** with the
   Zod issue's field & message.
2. Call `is_auth_attempt_allowed([emailKey, ipKey])`. If not allowed →
   **429 rate_limited** with the returned `retry_after_seconds`.
3. Call `supabase.auth.signUp({ email, password, options: { emailRedirectTo: <origin>/auth/callback?next=<next> } })`.
4. Map provider result:
   - Success → call `record_auth_attempt([...], success=true)`. Set the
     session cookies (`@supabase/ssr` does this on the response). Respond
     **200 ok**.
   - `user_already_exists` (or equivalent) → **409 email_exists**. Do **not**
     leak whether the existing account is confirmed (FR-015). Still call
     `record_auth_attempt([...], success=false)` so probing the existence of
     accounts is rate-limited by the same backoff.
   - Provider validation error (weak password, etc.) → **400 invalid_input**
     with `details.field = "password"` and `details.reason = <provider
     message verbatim>` (R5).
   - Other → **500 internal_error**, log to `logAuthEvent`.
5. Always call `logAuthEvent("sign-up", null, <outcome>, requestId)` on
   exit.

## Responses

### 200 OK

```json
{ "ok": true }
```

Sets the Supabase access + refresh cookies. The user is authenticated for
their current session even though their email is unconfirmed; the
confirmation banner is shown by the UI based on the unconfirmed state read
from the next request's `auth.users` row.

### 400 invalid_input

```json
{
  "error": {
    "code": "invalid_input",
    "message": "Please fix the highlighted fields and try again.",
    "details": { "field": "email" | "password" | "next", "reason": "string" }
  }
}
```

### 409 email_exists

```json
{
  "error": {
    "code": "email_exists",
    "message": "An account already exists for this email. Sign in instead."
  }
}
```

### 429 rate_limited

```json
{
  "error": {
    "code": "rate_limited",
    "message": "Too many attempts. Please try again shortly.",
    "retry_after_seconds": 17
  }
}
```

### 500 internal_error

```json
{ "error": { "code": "internal_error", "message": "Something went wrong." } }
```

## Integration tests (mandatory per Constitution VI)

`tests/integration/auth/sign-up.test.ts` MUST cover, against a local
Supabase:

- Happy path → 200; row exists in `auth.users`; `email_confirmed_at` is
  NULL; session cookies set; outbox contains a confirmation email.
- Duplicate email → 409; no second row created; backoff incremented for
  both `email` and `ip` keys.
- Invalid email → 400 with `field: "email"`; no row created.
- Provider-rejected password → 400 with `field: "password"` and
  `details.reason` faithfully echoing the provider message.
- Backoff: hit sign-up with the same email 5 times in a row, observe
  monotonically growing `retry_after_seconds`; verify cap at 30.
- Open-redirect guard: `next: "https://evil.com"` → 400 invalid_input
  for the `next` field.
