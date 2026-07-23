# Quickstart: Account Page & Saved Games Library

**Feature**: `009-account-library`
**Audience**: A developer or reviewer landing on this feature branch who wants to run it locally and see the flows end-to-end.

## Prerequisites

- Node ≥ 20, `npm` at the repo root.
- Supabase CLI (`brew install supabase/tap/supabase`).
- A `.env.local` for `packages/web` with the values expected by `packages/web/src/env.ts` (Supabase URL, anon key, service-role only if running admin scripts).
- No new global dependencies beyond feature 005's baseline.

## One-time setup on this branch

1. Install workspaces from repo root:
   ```bash
   npm install
   ```
2. Start Supabase locally:
   ```bash
   cd packages/web && supabase start
   ```
   Note: Supabase starts on `http://127.0.0.1:54321`.
3. Apply migrations (this feature adds `0002_account_library.sql`):
   ```bash
   supabase db reset
   ```
   Confirms both `0001_user_auth.sql` and `0002_account_library.sql` land cleanly and RLS is enabled on `profiles`, `games`, and `game_writes` (deny-all).
4. Regenerate types:
   ```bash
   supabase gen types typescript --local --schema public > packages/web/src/lib/supabase/types.gen.ts
   ```
   The generated file MUST be committed.

## Run the app

From the repo root:

```bash
npm run dev
```

The web app boots at `http://localhost:3000` with the middleware from feature 005 already rotating sessions.

## Verify the flows

Run each of these end-to-end to sanity-check the feature independently of the automated tests.

### Flow 1 — Account page: display name + password change (US1, P1)

1. Sign in with an existing confirmed account (or sign up + confirm using Supabase Studio's inbucket).
2. Notice the **collapsible sidebar** on the left. It replaces the old fixed top-right `AuthPill`. It should default to expanded on ≥ 1024 px, collapsed on smaller viewports. Toggle it and confirm the state persists across a reload (`localStorage` key `thestats.sidebar.v1`).
3. Click the profile icon at the bottom of the sidebar. You land on `/account`.
4. See your email (read-only) and the display name field (empty on a fresh account).
5. Set a display name. Save. The inline confirmation shows. Reload the page. The value persists.
6. Trigger the password change form. Enter the wrong current password → specific error, form remains dirty. Enter the correct current password + a policy-compliant new password → success; you remain signed in on this device.

### Flow 2 — Library shows in-progress and finished games (US2, P2)

1. On the same account, start a new game. Record 3–5 events (scores, fouls, subs). Observe network activity: a `POST /api/games` followed by debounced `PATCH /api/games/:id` calls each with a fresh `Idempotency-Key` header.
2. Navigate to `/account`. The library section lists the in-progress game with team labels, date, start time, "In progress" status, and current score.
3. Play a whole game to completion (or manually short-circuit to a finished state). Return to `/account`. The same game is now labeled "Finished" with its final score, and it stays on top of the list (most-recent activity first).

### Flow 3 — Continue an interrupted game (US3, P2)

1. In flow 2, don't finish the game — refresh the tab. Local persistence (feature 006) brings you back into the live view with the clock paused.
2. Navigate to `/account`. The in-progress game is present in the library.
3. **On a second device / private window** (still signed into the same account), open `/account`, pick the in-progress game, click "Continue". You should land on the live view with the same period, score, event history, and paused clock.

### Flow 4 — Review a finished game (US4, P3)

1. In `/account`, click a finished game.
2. You land at `/account/games/:id` with the **statsheet** and the **read-only game log** rendered. No edit affordances are present.
3. Back-navigate. The library restores its scroll position.

### Flow 5 — Anonymous local game on sign-in prompt (FR-024)

1. Sign out (still on this device). Start a new game as an anonymous user. Record a few events. The local key `thestats.game.v1` now holds the in-progress game.
2. Navigate to `/login`. Sign in with a valid account. **Before** the redirect completes, the `AnonymousGameOnSignInPrompt` modal blocks with three choices:
   - **Save to my account** → the local game appears in the library on the account page.
   - **Keep local only** → the redirect completes, the library does not contain the local game, but the local key still holds it (open `/` on the same device to confirm the game is still there).
   - **Discard** → the redirect completes, the local key is cleared, `/account` library does not contain the game.

### Flow 6 — Delete a game (FR-025)

1. In `/account`, click delete on an in-progress game. The dialog explicitly warns "You will lose N events (Period X)". Confirm → row disappears, refresh confirms it is gone.
2. Delete a finished game. Standard destructive-action dialog. Confirm → row disappears.

## Run the tests

From the repo root:

```bash
npm run test:all
```

This runs `typecheck` + `lint` + `vitest run --coverage` + `playwright test` across the workspace. All must pass on this branch before merge (Constitution).

Focused subsets:

```bash
# Unit / component tests colocated with source
npm run test --workspace=scorekeeping-app -- --run

# E2E for this feature only
npm run test:e2e --workspace=scorekeeping-app -- --grep "account"
```

Key test files added or extended in this feature:

- `packages/web/src/components/shell/AppSidebar.test.tsx`
- `packages/web/src/components/account/ProfileForm.test.tsx`
- `packages/web/src/components/account/ChangePasswordForm.test.tsx`
- `packages/web/src/components/account/GameLibrary.test.tsx`
- `packages/web/src/components/account/LibraryEntry.test.tsx`
- `packages/web/src/components/account/DeleteGameDialog.test.tsx`
- `packages/web/src/components/auth/AnonymousGameOnSignInPrompt.test.tsx`
- `packages/web/src/components/game/StatSheet.test.tsx`
- `packages/web/src/lib/games/writeThrough.test.ts`
- `packages/web/src/lib/validation/games.test.ts`
- `packages/web/src/lib/validation/profile.test.ts`
- `packages/web/src/app/api/games/route.test.ts` (integration — hits a real Supabase test project)
- `packages/web/src/app/api/games/[id]/route.test.ts` (integration)
- `packages/web/tests/e2e/account-profile.spec.ts`
- `packages/web/tests/e2e/account-library.spec.ts`
- `packages/core/src/stats.test.ts` (for `computeStatSheet`)

Route Handler integration tests exercise the auth + Zod validation + RLS paths per Constitution Principle VI's backend PR gate. They MUST be red before the handler is implemented and green after.

## Reset / troubleshooting

- **`profiles` row missing after sign-up**: expected. The row is created lazily on first `/account` load. If you never visit `/account`, no row is created.
- **Idempotency-Key header missing → 400**: expected. Client `useLibraryWriteThrough` and the sign-in-prompt "save" branch both set the header; if you're calling `PATCH /api/games/:id` manually with `curl`, you must set it too.
- **Library shows other users' games**: this would be an RLS regression. Fail the review immediately. Verify `games_select_own` policy in the migration.
- **"Continue" button opens a finished game into the live view**: bug. The library should route finished games to `/account/games/:id` (review view) and in-progress games through the hydrate → `/` flow.
- **`types.gen.ts` diff on CI**: someone forgot to regenerate after a migration. Run the `supabase gen types` command above and commit.
