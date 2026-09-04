/**
 * Account page (feature 009-account-library, US1; trimmed to profile-only
 * by feature 010-games-library, T016 per FR-020).
 *
 * Server Component. Auth-gated via `requireAuth`. Lazily ensures a
 * `public.profiles` row exists for the caller (Research R-03) and hands
 * the current values off to the presentation layer.
 *
 * The saved-games library that used to live here now lives at `/games`
 * (feature 010). Nothing on this page depends on the games list any
 * more; the page renders only the profile section and the sign-out
 * control.
 */
import { requireAuth } from "@/lib/auth/require-auth";
import { ensureProfile } from "./actions";
import { ProfileSection } from "@/components/account/ProfileSection";
import { SignOutButton } from "@/components/auth/sign-out-button";

export default async function AccountPage() {
  const { user } = await requireAuth({ from: "/account" });
  const profile = await ensureProfile();

  return (
    <main className="min-h-[100dvh] px-4 py-8 flex justify-center">
      <div className="w-full max-w-2xl flex flex-col gap-8">
        <header className="flex flex-col gap-1">
          <h1 className="heading-display text-3xl">Account</h1>
          <p className="text-sm text-ink-dim">
            Signed in as{" "}
            <span className="text-ink font-mono">{user.email}</span>.
          </p>
        </header>

        <ProfileSection
          email={user.email ?? ""}
          initialDisplayName={profile.displayName ?? ""}
        />

        <SignOutButton />
      </div>
    </main>
  );
}
