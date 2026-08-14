/**
 * Review page for a saved game (feature 009-account-library, US4).
 *
 * Server Component. Auth-gated via `requireAuth`. RLS on `public.games`
 * enforces ownership — a game owned by another user surfaces as
 * `notFound()` so we don't leak existence.
 *
 * Only finished games render the review view (FR-019). In-progress
 * games are redirected back to `/account`; those open via the Continue
 * button on `LibraryEntry` instead (US3).
 */
import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { createServerClient } from "@/lib/supabase/server";
import { fromSavedGameRecord, type GamesRow } from "@/lib/games/serialize";
import { GameReviewView } from "@/components/account/GameReviewView";

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
  await requireAuth({ from: "/account" });
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

  // In-progress games open via the Continue flow on /account, not here.
  if (record.status !== "finished") {
    redirect("/account");
  }

  return (
    <main className="min-h-[100dvh] px-4 py-8 flex justify-center">
      <div className="w-full max-w-4xl">
        <GameReviewView record={record.state} />
      </div>
    </main>
  );
}
