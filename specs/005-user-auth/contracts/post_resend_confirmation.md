# Contract: POST /api/auth/resend-confirmation

**Spec FRs**: FR-012, FR-015
**Route handler file**: `packages/web/src/app/api/auth/resend-confirmation/route.ts`
**Auth required**: No

## Request

```http
POST /api/auth/resend-confirmation
Content-Type: application/json
```

```json
{ "email": "string" }
```

### Validation (Zod — `resendInput`)

Email field only, same email rules as sign-up.

## Behavior

1. Parse body with `resendInput`. On failure → **400 invalid_input**.
2. `is_auth_attempt_allowed([emailKey, ipKey])`. Use the same `auth_attempts`
   keying as sign-up/sign-in so resends can't be used to bypass throttle.
3. Call `supabase.auth.resend({ type: "signup", email })`.
4. **Always** respond **200 ok** — same body whether the address is
   registered/unconfirmed or not (FR-015 forbids leaking account existence
   via resend triggers).
5. Internally:
   - If provider rejects because no such user / already confirmed:
     `record_auth_attempt([...], success=false)` and log; response is still
     200.
   - If provider accepts: `record_auth_attempt([...], success=true)`.

## Responses

### 200 OK

```json
{ "ok": true }
```

### 400 invalid_input

Same shape as sign-up's 400.

### 429 rate_limited

Same shape as sign-up's 429.

## Integration tests (mandatory)

`tests/integration/auth/resend-confirmation.test.ts` MUST cover:

- Unconfirmed registered email → 200; a new confirmation email is queued.
- Confirmed email → 200; no new email queued.
- Unknown email → 200; no email queued; response body identical to the
  confirmed-email case.
- Backoff applies and is shared with sign-up/sign-in attempts on the same
  email.
