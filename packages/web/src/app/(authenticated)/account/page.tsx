/**
 * Account page (feature 009-account-library, US1 + US2).
 *
 * Server Component. Auth-gated via `requireAuth`. Lazily ensures a
 * `public.profiles` row exists for the caller (Research R-03) and hands
 * the current values off to the presentation layer. Also fetches the
 * first batch of library entries server-side so the initial page render
 * shows the library without a client round-trip.
 *
 * The library section is wrapped in `<LibraryErrorBoundary>` so a
 * library render failure does not blank out the profile section (FR-014).
 */
import { requireAuth } from "@/lib/auth/require-auth";
import { ensureProfile } from "./actions";
import { createServerClient } from "@/lib/supabase/server";
import { ProfileSection } from "@/components/account/ProfileSection";
import { GameLibrary } from "@/components/account/GameLibrary";
import { LibraryErrorBoundary } from "@/components/account/LibraryErrorBoundary";
import { SignOutButton } from "@/components/auth/sign-out-button";
import type { LibraryEntry as Entry } from "@/lib/games/types";

const INITIAL_BATCH = 20;

async function loadInitialLibrary(): Promise<{
  entries: Entry[];
  nextCursor: string | null;
}> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("games")
    .select(
      "id, status, home_team_name, away_team_name, home_score, away_score, event_count, current_period, started_at, last_activity_at, finished_at",
    )
    .order("last_activity_at", { ascending: false })
    .limit(INITIAL_BATCH);

  if (error) {
    // Fall through to an empty result. The client-side hydrated
    // <GameLibrary> will still try `/api/games` if the user retries, and
    // the LibraryErrorBoundary catches any thrown render errors.
    return { entries: [], nextCursor: null };
  }

  const rows = data ?? [];
  const entries: Entry[] = rows.map((row) => ({
    id: row.id,
    status: row.status === "finished" ? "finished" : "in-progress",
    homeTeamName: row.home_team_name,
    awayTeamName: row.away_team_name,
    homeScore: row.home_score,
    awayScore: row.away_score,
    eventCount: row.event_count,
    currentPeriod: row.current_period,
    startedAt: row.started_at,
    lastActivityAt: row.last_activity_at,
    finishedAt: row.finished_at,
  }));
  const nextCursor =
    entries.length === INITIAL_BATCH
      ? entries[entries.length - 1]?.lastActivityAt ?? null
      : null;
  return { entries, nextCursor };
}

export default async function AccountPage() {
  const { user } = await requireAuth({ from: "/account" });
  const profile = await ensureProfile();
  const library = await loadInitialLibrary();

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

        <LibraryErrorBoundary>
          <GameLibrary
            initialEntries={library.entries}
            initialNextCursor={library.nextCursor}
          />
        </LibraryErrorBoundary>
        <SignOutButton/>
      </div>
    </main>
  );
}
