# Server Action Contracts: Account Profile

**Feature**: `009-account-library`
**Location**: `packages/web/src/app/account/actions.ts`
**Auth**: Every Server Action starts with `createServerClient()` + `getUser()`. Missing session → throw a redirect to `/login?from=/account`.

All actions Zod-validate their input, use only session-derived identity, and return a small `Result` shape rather than throwing on user errors:

```ts
type ActionResult<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };
```

The client-side form components (`ProfileForm.tsx`, `ChangePasswordForm.tsx`) surface `error.message` inline and keep the form's dirty state so the user does not lose in-flight edits (FR-006, FR-008).

---

## `ensureProfile()` — internal helper (not a Server Action)

Called on Server Component `/account` render.

```ts
async function ensureProfile(userId: string): Promise<ProfileRow>;
```

- Runs `INSERT INTO public.profiles(id) VALUES ($1) ON CONFLICT (id) DO NOTHING` under the session's JWT (RLS `INSERT` policy `WITH CHECK (id = auth.uid())`).
- Returns the row (fresh insert or existing) via a follow-up `SELECT`.
- Idempotent: first `/account` load creates the row; every subsequent load reuses it.

---

## `updateDisplayName(formData: FormData): Promise<ActionResult<{ displayName: string | null }>>`

Update the caller's `profiles.display_name`. Called from `ProfileForm.tsx` on submit.

**Input** (Zod-validated):

```ts
const UpdateDisplayNameSchema = z.object({
  displayName: z.string().trim().max(64).transform(v => (v.length === 0 ? null : v)),
});
```

- Empty string → stored as `NULL` (the UI's "clear my display name" affordance is submit-with-empty).
- Trailing whitespace trimmed.
- Anything above 64 chars → `{ code: 'display_name_too_long' }`.

**Behavior**:
1. Verify session (redirect if missing).
2. Parse `formData.get('displayName')` with the schema.
3. `UPDATE public.profiles SET display_name = $1 WHERE id = auth.uid()` (RLS enforces owner match).
4. `revalidatePath('/account')` so the Server Component reads the fresh value on next load.
5. Return `{ ok: true, value: { displayName } }`.

**Errors** (never thrown; surfaced as `ActionResult`):
- `display_name_too_long` — Zod rejected the input.
- `display_name_invalid` — reserved for future extensions (e.g., banned characters); not raised in v1.

---

## `changePassword(formData: FormData): Promise<ActionResult<{ signedIn: true }>>`

Change the caller's Supabase password. Called from `ChangePasswordForm.tsx` on submit. The form must include `currentPassword` and `newPassword`.

**Input** (Zod-validated):

```ts
const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),                 // presence only; the provider will verify correctness
  newPassword: z.string().min(1),                     // provider policy is the source of truth
});
```

theStats does not layer its own password policy on top of Supabase (matching feature 005's clarification: "Defer to the integrated auth provider's default policy").

**Behavior**:
1. Verify session; capture the user's email from `getUser()`.
2. Re-authenticate current password: call `supabase.auth.signInWithPassword({ email, password: currentPassword })` on a **temporary** server client (does not affect the current cookie). If it fails, return `{ code: 'current_password_incorrect' }` without differentiating between "wrong password" and "user does not exist" (mirrors the anti-enumeration stance of feature 005's FR-007).
3. On success, call `supabase.auth.updateUser({ password: newPassword })` on the session-cookie server client. If Supabase rejects the new password (policy failure), return the provider's rejection reason (`{ code: 'new_password_rejected', message: <provider-supplied>}`) verbatim — no re-wrapping (feature 005's FR-003 pattern).
4. Do **not** invalidate the current session cookie. The user remains signed in on this device (per the resolved FR-005 wording).
5. Emit a structured audit log (`event: 'password_changed', user_id: <id>`) — no password material logged.
6. Return `{ ok: true, value: { signedIn: true } }`.

**Errors** (surfaced as `ActionResult`):
- `current_password_incorrect` — mismatch or non-existent user.
- `new_password_rejected` — Supabase-provided reason (e.g., "Password should be at least 6 characters").
- `unauthenticated` — session missing (should not occur if the form is only rendered under the account-gated route).

**Anti-brute-force**: Feature 005's `auth_attempts` throttle applies here — the `signInWithPassword` re-auth call goes through the same code path Supabase already exercises for sign-in, which the `record_auth_attempt` / `is_auth_attempt_allowed` RPCs already gate. No new throttle table is needed.

---

## `resolveAnonymousGameOnSignIn(choice: 'save' | 'keep' | 'discard', payload?: SavedGameStatePayload): Promise<ActionResult<{ savedGameId?: string }>>`

Complete the FR-024 blocker prompt. Called from `AnonymousGameOnSignInPrompt.tsx` after the user picks a choice.

Notes:
- This is thin glue — the "save" branch delegates to `POST /api/games` (which enforces idempotency and returns the created row); the "keep" branch is a no-op server-side; the "discard" branch is a no-op server-side (the client clears its own local key).
- The action exists as a single Server Action mainly so the sign-in flow can `await` a decision before navigating.

**Input** (Zod-validated):

```ts
const AnonymousGameChoiceSchema = z.discriminatedUnion('choice', [
  z.object({ choice: z.literal('save'), state: PersistedGameRecordSchema }),
  z.object({ choice: z.literal('keep') }),
  z.object({ choice: z.literal('discard') }),
]);
```

**Behavior**:
- `save` → issue a server-side `fetch` to `/api/games` with the state and a server-generated `Idempotency-Key`. Return the new game's `id`.
- `keep` → return `{ ok: true, value: {} }`. The client is expected to leave `localStorage` alone.
- `discard` → return `{ ok: true, value: {} }`. The client clears its own local key.

**Errors**: `invalid_body` on Zod failure; any error from the downstream `POST /api/games` (surfaced with the same code).

---

## Consistency guarantees

- Every Server Action here treats the session as authoritative — no path accepts a client-supplied `userId`.
- Every action Zod-validates every incoming field before touching the DB.
- Errors never leak provider or Postgres text into `message` beyond what feature 005's precedent already surfaces (password policy strings from Supabase).
- Tests: colocated `.test.ts` files exercise (a) unauthenticated call → redirect, (b) Zod rejection → `ok: false`, (c) happy path → DB row observed, (d) idempotency behavior (repeat of a save is a no-op).
