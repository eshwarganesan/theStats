# Contract: `GET /api/account/status`

Answers whether an account still exists. A signed-out device uses it to find out whether the account it was signed in to has been deleted (research R6). It is public by necessity: its callers no longer hold a valid session.

## Request

| Part | Value |
|---|---|
| Method | `GET` (pure read) |
| Auth | None. Any `Authorization` header or cookie is ignored |
| Query | `userId`: a UUID (`AccountStatusQuerySchema`) |

## Responses

Every response sends `Cache-Control: no-store`.

| Status | Body | When |
|---|---|---|
| `200` | `{ "exists": true }` | `auth.admin.getUserById(userId)` found the user |
| `200` | `{ "exists": false }` | Auth answered `404 user_not_found` |
| `400` | `{ "error": { "code": "invalid_query_params", "message": "userId must be a UUID." } }` | Missing or malformed `userId` |
| `500` | `{ "error": { "code": "internal_error", "message": "Something went wrong." } }` | Any other lookup failure |

## Client rules

| Answer | Web | iOS |
|---|---|---|
| `exists: false` | `handleAccountGone("deleted-elsewhere")` | `handleAccountGone("deleted-elsewhere")` |
| `exists: true` | Forget `thestats.account.v1`; no notice | Nothing; the device game is kept for the same user |
| `400`, `500` or offline | Leave state as is; ask again on the next signed-out page load | Ask again on the next foreground while signed out |

Clients parse the reply with `parseAccountStatus` from `@thestats/app`, and a reply that doesn't parse counts as an error. A device asks only about the account it remembers, at most once per sign-out on the web and once per launch on iOS.

## Security notes

- The only output is one boolean about a random UUIDv4. User IDs are never shown to other users (RLS), and guessing a live one is infeasible.
- The admin client is used for this single read (Complexity Tracking).
- There's no application rate limit (research R6). Platform limits apply.
- Logging: `handler: "account-status"`, `request_id` and `outcome` (`exists` / `missing` / `invalid_query_params` / `internal_error`). The user ID being asked about isn't logged as `user_id`, because the caller isn't authenticated.

## Integration tests

1. An existing user's ID: `200 { exists: true }`.
2. A deleted user's ID (create, then delete through the admin API): `200 { exists: false }`.
3. A random UUID: `200 { exists: false }`.
4. `userId=abc`, or no parameter: `400 invalid_query_params`.
5. The response always carries `Cache-Control: no-store`.
