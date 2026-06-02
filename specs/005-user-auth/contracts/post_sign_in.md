# Contract: POST /api/auth/sign-in

**Spec FRs**: FR-006, FR-007, FR-008, FR-011, FR-013, FR-015
**Route handler file**: `packages/web/src/app/api/auth/sign-in/route.ts`
**Auth required**: No

## Request

```http
POST /api/auth/sign-in
Content-Type: application/json
```

```json
{ "email": "string", "password": "string", "next": "string?" }
```

### Validation (Zod — `signInInput` in `lib/auth/schemas.ts`)

Same shape as `signUpInput` (R5 / Clarification Q2): no password
strength rule, just non-empty.

## Behavior

1. Parse body with `signInInput`. On failure → **400 invalid_input**.
2. `is_auth_attempt_allowed([emailKey, ipKey])`. If not allowed → **429
   rate_limited**.
3. Call `supabase.auth.signInWithPassword({ email, password })`.
4. Map provider result:
   - Success and email **confirmed** → `record_auth_attempt([...],
     success=true)`. Set cookies. Respond **200 ok**.
   - Success and email **unconfirmed** → call `auth.signOut` server-side
     (do NOT keep the session live), then respond **403 email_unconfirmed**.
     Still treat as a success for the throttle reset — the user knows the
     password.
   - Invalid credentials → `record_auth_attempt([...], success=false)`.
     Respond **401 invalid_credentials** with the *generic* message; FR-007
     forbids disclosing whether the email is registered.
   - Other → **500 internal_error**.
5. `logAuthEvent("sign-in", userIdOrNull, outcome, requestId)`.

## Responses

### 200 OK

```json
{ "ok": true }
```

### 400 invalid_input

Same shape as sign-up's 400.

### 401 invalid_credentials

```json
{
  "error": {
    "code": "invalid_credentials",
    "message": "Invalid email or password."
  }
}
```

### 403 email_unconfirmed

```json
{
  "error": {
    "code": "email_unconfirmed",
    "message": "Please confirm your email before signing in.",
    "details": { "resend_endpoint": "/api/auth/resend-confirmation" }
  }
}
```

### 429 rate_limited

Same shape as sign-up's 429.

### 500 internal_error

Same shape as sign-up's 500.

## Account-enumeration safety (FR-015)

The 401 and the 404-equivalent (account does not exist) MUST return the
same response — same status, same body, same response time (within
practical variance). The 403 (`email_unconfirmed`) does leak that the
account exists, which is acceptable because the user authenticated to
themselves to reach that branch.

## Integration tests (mandatory)

`tests/integration/auth/sign-in.test.ts` MUST cover:

- Happy path (confirmed user, correct password) → 200; session cookies set.
- Wrong password → 401 with generic message; backoff incremented.
- Nonexistent email → 401 with **same** body and status as wrong password.
- Confirmed user with capslock-different email casing → 200 (emails are
  case-insensitive in the schema).
- Unconfirmed user, correct password → 403 `email_unconfirmed`; session
  cookies NOT set.
- Backoff timing: 5 consecutive failures → next attempt returns 429 with
  growing `retry_after_seconds` (1, 2, 4, 8, 16, capped at 30); a
  successful sign-in resets the counter to 0.
