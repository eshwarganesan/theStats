/**
 * Route Handlers for `/api/games/[id]` (feature 009-account-library,
 * US3 GET + PATCH; US4 will extend with DELETE).
 *
 * - GET   → return the full record for the caller's game (or 404).
 * - PATCH → write-through save for a mutated game state (idempotent,
 *           recomputes summary columns, sets `finished_at` on the
 *           transition, refuses to mutate a game already in the
 *           `finished` state with 409 `finished_game_locked`).
 *
 * All handlers flow through `withAuthenticatedHandler` for uniform
 * auth + logging + error envelope. Ownership is enforced by RLS on
 * `public.games`; a request for another user's row surfaces as a 404
 * so existence is never leaked (matches the anti-enumeration stance
 * from feature 005).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthenticatedHandler, jsonError, type ServerSupabase } from "@/lib/api/handler";
import { PatchGameBodySchema } from "@/lib/validation/games";
import { readIdempotencyKey } from "@/lib/games/idempotency";
import {
  deriveSummaryColumns,
  fromSavedGameRecord,
  type GamesRow,
} from "@/lib/games/serialize";
import type { TablesUpdate } from "@/lib/supabase/database.types";

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

const IdSchema = z.string().uuid();

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ─── GET /api/games/[id] ───────────────────────────────────────────────

async function getHandler(
  request: Request,
  ctx: { supabase: ServerSupabase },
  gameId: string,
): Promise<Response> {
  void request;
  const { data, error } = await ctx.supabase
    .from("games")
    .select(FULL_COLUMNS)
    .eq("id", gameId)
    .maybeSingle();

  if (error) {
    return jsonError("internal_error", "Could not load the game.");
  }
  if (!data) {
    // RLS filters other users' rows to the same "not found" surface
    // Route Handlers get for a genuinely missing row.
    return jsonError("not_found", "Game not found.");
  }

  const record = fromSavedGameRecord(data as unknown as GamesRow);
  return NextResponse.json({ game: record });
}

export async function GET(request: Request, ctx: RouteContext): Promise<Response> {
  const { id } = await ctx.params;
  const parsedId = IdSchema.safeParse(id);
  if (!parsedId.success) return jsonError("invalid_id", "Bad game id.");
  return withAuthenticatedHandler("games:get", async (req, wrapCtx) =>
    getHandler(req, wrapCtx, parsedId.data),
  )(request);
}

// ─── PATCH /api/games/[id] ─────────────────────────────────────────────

async function patchHandler(
  request: Request,
  ctx: { supabase: ServerSupabase },
  gameId: string,
): Promise<Response> {
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

  const parsed = PatchGameBodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError("invalid_body", "Body did not match the expected schema.");
  }

  // Read the current row first so we can (a) return 404 for missing/
  // filtered rows and (b) refuse to mutate a finished game.
  const current = await ctx.supabase
    .from("games")
    .select("id, status")
    .eq("id", gameId)
    .maybeSingle();

  if (current.error) {
    return jsonError("internal_error", "Could not load the game.");
  }
  if (!current.data) {
    return jsonError("not_found", "Game not found.");
  }
  if (current.data.status === "finished") {
    return jsonError(
      "finished_game_locked",
      "This game is finished and cannot be modified.",
    );
  }

  // Reserve the idempotency key before applying the write. A duplicate
  // key short-circuits to returning the current row without a second
  // update.
  const reserve = await ctx.supabase.rpc("record_game_write", {
    p_key: idempotencyKey,
    p_game_id: gameId,
  });
  if (reserve.error) {
    return jsonError("internal_error", "Could not record the write.");
  }
  if (reserve.data !== true) {
    const existing = await ctx.supabase
      .from("games")
      .select(FULL_COLUMNS)
      .eq("id", gameId)
      .single();
    if (existing.error || !existing.data) {
      return jsonError("internal_error", "Could not resolve idempotent write.");
    }
    return NextResponse.json({
      game: fromSavedGameRecord(existing.data as unknown as GamesRow),
    });
  }

  const summary = deriveSummaryColumns(parsed.data.state);
  const update: TablesUpdate<"games"> = {
    state: parsed.data.state as never,
    status: summary.status,
    home_team_name: summary.homeTeamName,
    away_team_name: summary.awayTeamName,
    home_score: summary.homeScore,
    away_score: summary.awayScore,
    event_count: summary.eventCount,
    current_period: summary.currentPeriod,
  };
  if (summary.status === "finished") {
    update.finished_at = new Date().toISOString();
  }

  const updated = await ctx.supabase
    .from("games")
    .update(update)
    .eq("id", gameId)
    .select(FULL_COLUMNS)
    .single();

  if (updated.error || !updated.data) {
    return jsonError("internal_error", "Could not save the game.");
  }

  return NextResponse.json({
    game: fromSavedGameRecord(updated.data as unknown as GamesRow),
  });
}

export async function PATCH(request: Request, ctx: RouteContext): Promise<Response> {
  const { id } = await ctx.params;
  const parsedId = IdSchema.safeParse(id);
  if (!parsedId.success) return jsonError("invalid_id", "Bad game id.");
  return withAuthenticatedHandler("games:patch", async (req, wrapCtx) =>
    patchHandler(req, wrapCtx, parsedId.data),
  )(request);
}
