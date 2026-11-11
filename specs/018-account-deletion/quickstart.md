# Quickstart: Account Deletion

How to run and check this feature locally. **Use local Supabase only.** The hosted project serves the live site, and these steps create and delete accounts.

## 1. Start the stack

```bash
cd packages/web
supabase start          # local Postgres + Auth from this branch's migrations
eval "$(supabase status -o env)"
export NEXT_PUBLIC_SUPABASE_URL=$API_URL
export NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
export SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY
npm run dev             # http://localhost:3000
```

There's no new migration and no new environment variable. The service-role key is already required by `getServerEnv()`.

## 2. Automated checks

```bash
# from the repo root
npm test --workspace @thestats/app        # schemas, notice copy, write-through account_deleted
cd packages/web
npm run typecheck && npm run lint
npm run test:coverage                     # unit + route integration (needs the env above)
npm run test:e2e                          # includes tests/e2e/account-deletion.spec.ts
cd ../mobile
npm test                                  # account screen, apiFetch, session check, cleanup
```

## 3. Manual check on the web (User Stories 1, 3 and 4)

1. **Delete an account**:
   1. Sign up at `/login`, confirm via Inbucket (`http://localhost:54324`), then start a game and record a few plays.
   2. Open `/account`. "Delete account" sits in its own danger panel at the bottom.
   3. **Cancel**: open the dialog and press Esc. Nothing changes.
   4. **Wrong password**: "Current password is incorrect." Repeat until "Too many attempts. Try again in N seconds."
   5. **Right password**: you land on `/` with "Your account has been deleted." In DevTools, `thestats.game.v1`, `thestats.clock.v1` and `thestats.account.v1` are gone, and so are the `sb-*-auth-token` cookies.
   6. Sign in with the old credentials: "Invalid email or password." Sign up again with the same email: an empty games list.
2. **Keyboard only**: repeat the flow with Tab, Enter and Esc. VoiceOver or NVDA announces the dialog title, errors and the landing notice.
3. **Narrow screen**: in DevTools device mode at 360 px wide, open the dialog. The password field and both buttons are visible without scrolling sideways.
4. **Two tabs**: open the live game page in a second tab of the same browser, then delete in the first. The second tab jumps to the landing page with "Your account has been deleted.", and the `thestats.*` keys stay gone.
5. **Two browsers**:
   1. Sign the same account in to a normal and a private window.
   2. Delete it in one.
   3. In the other, open `/games`. You land on `/` with "You were signed out because this account was deleted."
   4. Repeat, but in the second window record a play on the live game page instead. You land on the same notice.
6. **Expired session**:
   1. In the second window, delete the `sb-*-auth-token` cookies but keep localStorage, which simulates an expired session.
   2. Delete the account in the first window.
   3. Reload the second. The status check finds the account gone and shows the same notice.

## 4. Manual check on iOS (User Story 2)

Run the web API locally (above), then `cd packages/mobile && npx expo start`, using Expo Go or the iOS simulator.

1. Sign in. Home shows "Account" next to "Sign out". Tap it: the Account screen shows "Signed in as <email>".
2. Start a game on the device, then go back to Account. Tap **Delete account**:
   - Close and Cancel send nothing.
   - A wrong password shows the error.
   - The right password lands on the sign-in screen with "Your account has been deleted." (VoiceOver announces it.)
3. Sign up again with the same email. Home shows neither the old library nor the device game.
4. **iPhone in landscape** (smallest simulator available): with the keyboard up in the confirmation sheet, scroll to the password field and both buttons.
5. **Deleted elsewhere**:
   1. Sign in on the device and on the web with the same account, then delete it on the web.
   2. On the device, leave Home and come back (the library reloads), or record a play. The app returns to sign-in with "You were signed out because this account was deleted."
6. **Expired on iOS**: sign in on the device, close the app, delete the account on the web, wait for the access token to expire (1 h locally, or lower `jwt_expiry` in `supabase/config.toml`), then reopen the app. The same notice shows.

## 5. Shipping notes

- **Web**: nothing to configure on Vercel; the service-role key is already set. Deploy the web app **before** shipping an iOS build that calls `/api/account/*`.
- **iOS**: in-app deletion clears the App Store blocker for guideline 5.1.1(v). Once this merges, update the blocker list in `packages/mobile/README.md`.
