/**
 * Playwright global teardown — deletes the shared E2E user created in
 * `global-setup.ts` (feature 011 FOLLOW-UP-1).
 *
 * Best-effort by design: a failed teardown must NOT mark the whole run
 * red. The next run's `globalSetup` is idempotent (delete + recreate),
 * so any leaked user is cleaned up automatically on the next execution.
 */
import { createClient } from "@supabase/supabase-js";
import { E2E_SHARED_EMAIL } from "./global-setup";

async function globalTeardown(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return;

  const admin = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { data } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    const user = data.users.find((u) => u.email === E2E_SHARED_EMAIL);
    if (user) {
      await admin.auth.admin.deleteUser(user.id);
    }
  } catch {
    /* best-effort */
  }
  try {
    await admin.from("auth_attempts").delete().eq("key", `e:${E2E_SHARED_EMAIL}`);
  } catch {
    /* best-effort */
  }
}

export default globalTeardown;
