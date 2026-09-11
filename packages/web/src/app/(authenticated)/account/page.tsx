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
import { HamburgerButton } from "@/components/shell/HamburgerButton";

export default async function AccountPage() {
  const { user } = await requireAuth({ from: "/account" });
  const profile = await ensureProfile();

  return (
    <main className="min-h-[100dvh] flex flex-col">
      <header className="h-14 shrink-0 flex items-center justify-between px-5 md:px-8 border-b border-surface-border">
        <div className="flex items-center gap-4">
          <HamburgerButton />
          <h1 className="heading-display text-xl">Account</h1>
        </div>
      </header>

      <div className="flex-1 px-4 py-8 flex justify-center">
        <div className="w-full max-w-2xl flex flex-col gap-8">
          <p className="text-sm text-ink-dim">
            Signed in as{" "}
            <span className="text-ink font-mono">{user.email}</span>.
          </p>

          <ProfileSection
            email={user.email ?? ""}
            initialDisplayName={profile.displayName ?? ""}
          />

          <SignOutButton />
        </div>
      </div>
    </main>
  );
}
