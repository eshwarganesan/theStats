/**
 * Games page (feature 010-games-library, US1 + US2).
 *
 * Server Component. Auth-gated via `requireAuth` (spec FR-006). Fetches
 * the first batch of the user's library entries server-side so the
 * initial paint shows the list without a client round-trip — same shape
 * as `packages/web/src/app/(authenticated)/account/page.tsx` used before
 * FR-020 relocated the library out to this dedicated page.
 *
 * The `<NewGameCta>` sits above the list so it is always visible without
 * scrolling (FR-013) and doubles as the primary call-to-action on the
 * empty state (FR-010).
 *
 * The list section is wrapped in `<LibraryErrorBoundary>` so a library
 * render failure does not blank out the page shell (FR-012 / SC-006).
 */
import { requireAuth } from "@/lib/auth/require-auth";
import { createServerClient } from "@/lib/supabase/server";
import { GameLibrary } from "@/components/games/GameLibrary";
import { LibraryErrorBoundary } from "@/components/games/LibraryErrorBoundary";
import { NewGameCta } from "@/components/games/NewGameCta";
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

export default async function GamesPage() {
  await requireAuth({ from: "/games" });
  const library = await loadInitialLibrary();

  return (
    <main className="min-h-[100dvh] px-4 py-8 flex justify-center">
      <div className="w-full max-w-2xl flex flex-col gap-6">
        <header className="flex items-center justify-between gap-4">
          <h1 className="heading-display text-3xl">Games</h1>
          <NewGameCta />
        </header>

        <LibraryErrorBoundary>
          <GameLibrary
            initialEntries={library.entries}
            initialNextCursor={library.nextCursor}
          />
        </LibraryErrorBoundary>
      </div>
    </main>
  );
}
