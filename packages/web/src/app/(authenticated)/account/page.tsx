/**
 * Demonstration account-gated route.
 *
 * This page exists to anchor the auth gate the feature ships — Phase 5's
 * E2E test exercises the deep-link-redirect behavior against it (FR-009,
 * hybrid mode per Clarification Q1). Future features will expand what
 * lives here (profile, account settings, etc.); for v1 it deliberately
 * shows only the signed-in email.
 */
import { requireAuth } from "@/lib/auth/require-auth";

export default async function AccountPage() {
  const { user } = await requireAuth({ from: "/account" });

  return (
    <main className="min-h-[100dvh] flex items-center justify-center px-4 py-8">
      <div className="panel p-6 flex flex-col gap-3 max-w-md w-full">
        <h1 className="heading-display text-2xl">Account</h1>
        <p className="text-sm text-ink-dim">
          Signed in as <span className="text-ink">{user.email}</span>.
        </p>
        <p className="text-xs text-ink-dim">
          Profile management is coming in a future release. For now, sign out from
          the badge in the top-right to switch accounts.
        </p>
      </div>
    </main>
  );
}
