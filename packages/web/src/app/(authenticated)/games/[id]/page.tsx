/**
 * Review page for a saved game (feature 010-games-library, US3).
 *
 * Server Component. Auth-gated via `requireAuth`. RLS on `public.games`
 * enforces ownership — a game owned by another user surfaces as
 * `notFound()` so we don't leak existence.
 *
 * Only finished games render the review view (FR-017). In-progress
 * games are redirected back to `/games`; those open via the Continue
 * button on `LibraryEntry` from the Games page (FR-016).
 *
 * Byte-for-byte equivalent to the previous `/account/games/[id]` route
 * (feature 009), with the redirect target and auth-return-target
 * updated to `/games` per feature 010's FR-005 / FR-006. The old route
 * is decommissioned by a `next.config.mjs` 301 redirect (FR-021).
 */
import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { createServerClient } from "@/lib/supabase/server";
import { fromSavedGameRecord, type GamesRow } from "@/lib/games/serialize";
import { GameReviewView } from "@/components/games/GameReviewView";

interface ReviewPageProps {
  params: Promise<{ id: string }>;
}

const FULL_COLUMNS = [
  "id",
  "owner_id",
  "state",
  "status",
  "home_team_name",
  "away_team_name",
  "home_score",
  "away_score",
  "event_count",
  "current_period",
  "started_at",
  "last_activity_at",
  "finished_at",
].join(", ");

export default async function ReviewPage({ params }: ReviewPageProps) {
  await requireAuth({ from: "/games" });
  const { id } = await params;

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("games")
    .select(FULL_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  const record = fromSavedGameRecord(data as unknown as GamesRow);

  // In-progress games open via the Continue flow on /games, not here.
  if (record.status !== "finished") {
    redirect("/games");
  }

  return (
    <main className="min-h-[100dvh] px-4 py-8 flex justify-center">
      <div className="w-full max-w-4xl">
        <GameReviewView record={record.state} />
      </div>
    </main>
  );
}
