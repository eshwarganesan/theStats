/**
 * Route Handlers for `/api/games` (feature 009-account-library, US2).
 *
 * - GET  → list the caller's library entries (paginated, most-recent-activity first)
 * - POST → create a new saved game (write-through save at game start)
 *
 * Every handler flows through `withAuthenticatedHandler` so session
 * verification, structured logging, and the uniform error envelope live
 * in one place (Constitution Principle VI). RLS on `public.games`
 * (`SELECT/INSERT WHERE owner_id = auth.uid()`) is the authoritative
 * ownership check; nothing here trusts a client-supplied user id.
 */
import { NextResponse } from "next/server";
import { withAuthenticatedHandler, jsonError } from "@/lib/api/handler";
import { LibraryQuerySchema, PostGameBodySchema } from "@/lib/validation/games";
import { readIdempotencyKey } from "@/lib/games/idempotency";
import {
  deriveSummaryColumns,
  fromSavedGameRecord,
  type GamesRow,
} from "@/lib/games/serialize";
import type { LibraryEntry, LibraryPage } from "@/lib/games/types";

const LIBRARY_COLUMNS = [
  "id",
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

const FULL_COLUMNS = ["owner_id", "state"].concat(LIBRARY_COLUMNS.split(", ")).join(", ");

interface LibraryRow {
  id: string;
  status: string;
  home_team_name: string;
  away_team_name: string;
  home_score: number;
  away_score: number;
  event_count: number;
  current_period: number;
  started_at: string;
  last_activity_at: string;
  finished_at: string | null;
}

function rowToLibraryEntry(row: LibraryRow): LibraryEntry {
  return {
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
  };
}

// ─── GET /api/games ────────────────────────────────────────────────────

export const GET = withAuthenticatedHandler(
  "games:list",
  async (request, { supabase }) => {
    const url = new URL(request.url);
    const parsed = LibraryQuerySchema.safeParse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      return jsonError("invalid_query_params", "Bad query parameters.");
    }

    let query = supabase
      .from("games")
      .select(LIBRARY_COLUMNS)
      .order("last_activity_at", { ascending: false })
      .limit(parsed.data.limit);

    if (parsed.data.cursor) {
      query = query.lt("last_activity_at", parsed.data.cursor);
    }

    const { data, error } = await query;
    if (error) {
      return jsonError("internal_error", "Could not load your library.");
    }

    const rows = (data ?? []) as unknown as LibraryRow[];
    const entries = rows.map(rowToLibraryEntry);
    const nextCursor =
      entries.length === parsed.data.limit
        ? entries[entries.length - 1]?.lastActivityAt ?? null
        : null;

    const body: LibraryPage = { entries, nextCursor };
    return NextResponse.json(body);
  },
);

// ─── POST /api/games ───────────────────────────────────────────────────

export const POST = withAuthenticatedHandler(
  "games:create",
  async (request, { userId, supabase }) => {
    const idempotencyKey = readIdempotencyKey(request);
    if (!idempotencyKey) {
      return jsonError(
        "idempotency_key_required",
        "Idempotency-Key header is required.",
      );
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return jsonError("invalid_body", "Request body must be valid JSON.");
    }

    const parsed = PostGameBodySchema.safeParse(raw);
    if (!parsed.success) {
      return jsonError("invalid_body", "Body did not match the expected schema.");
    }

    const summary = deriveSummaryColumns(parsed.data.state);

    const insertResult = await supabase
      .from("games")
      .insert({
        owner_id: userId,
        state: parsed.data.state as never,
        status: summary.status,
        home_team_name: summary.homeTeamName,
        away_team_name: summary.awayTeamName,
        home_score: summary.homeScore,
        away_score: summary.awayScore,
        event_count: summary.eventCount,
        current_period: summary.currentPeriod,
      })
      .select(FULL_COLUMNS)
      .single();

    if (insertResult.error || !insertResult.data) {
      return jsonError("internal_error", "Could not save the game.");
    }

    const inserted = insertResult.data as unknown as GamesRow;

    // Record the idempotency key. If the key was already recorded (duplicate
    // POST retry), the RPC returns `false`; in that case we roll back the
    // fresh insert and return the previously-inserted row instead.
    const rpc = await supabase.rpc("record_game_write", {
      p_key: idempotencyKey,
      p_game_id: inserted.id,
    });
    if (rpc.error) {
      // Best-effort cleanup on RPC failure.
      await supabase.from("games").delete().eq("id", inserted.id);
      return jsonError("internal_error", "Could not save the game.");
    }

    if (rpc.data !== true) {
      // Duplicate key — delete the fresh row and return the previously-saved
      // one associated with this key. game_writes is RLS deny-all, so the
      // key → game_id lookup goes through a SECURITY DEFINER RPC; ownership
      // is still enforced by the subsequent SELECT on public.games.
      await supabase.from("games").delete().eq("id", inserted.id);
      const prevKey = await supabase.rpc("get_game_write_game_id", {
        p_key: idempotencyKey,
      });
      if (prevKey.error || !prevKey.data) {
        return jsonError("internal_error", "Could not resolve idempotency key.");
      }
      const prev = await supabase
        .from("games")
        .select(FULL_COLUMNS)
        .eq("id", prevKey.data)
        .single();
      if (prev.error || !prev.data) {
        return jsonError("internal_error", "Could not resolve idempotent write.");
      }
      const record = fromSavedGameRecord(prev.data as unknown as GamesRow);
      return NextResponse.json({ game: record }, { status: 200 });
    }

    const record = fromSavedGameRecord(inserted);
    return NextResponse.json({ game: record }, { status: 201 });
  },
);
