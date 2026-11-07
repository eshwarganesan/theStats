import {
  LibraryEntrySchema,
  LibraryPageSchema,
  parseGameRecord,
  type LibraryEntry,
  type LibraryPage,
  type PersistedGameRecord,
} from "@thestats/app";

import { apiFetch } from "@/lib/api";

export type ListGamesResult = { ok: true; page: LibraryPage } | { ok: false; message: string };

/** A game from the library: its summary row and its full saved state. */
export interface SavedGame {
  entry: LibraryEntry;
  state: PersistedGameRecord;
}

export type GetGameResult = { ok: true; game: SavedGame } | { ok: false; message: string };
export type DeleteGameResult = { ok: true } | { ok: false; message: string };

const OFFLINE = "Can't reach theStats. Check your connection and try again.";
const FAILED = "Couldn't load your games. Please try again.";
const GAME_FAILED = "Couldn't load the game. Please try again.";
const GONE = "That game isn't in your library any more.";
const DELETE_FAILED = "Couldn't delete the game. Please try again.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function send(path: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await (init ? apiFetch(path, init) : apiFetch(path));
  } catch {
    return null;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

const gamePath = (id: string) => `/api/games/${encodeURIComponent(id)}`;

/**
 * One page of the signed-in user's game library (GET /api/games), most
 * recent activity first. Pass the previous page's `nextCursor` for the
 * next one. The response is validated before it reaches the UI.
 */
export async function listGames(cursor?: string | null): Promise<ListGamesResult> {
  const query = cursor ? `?${new URLSearchParams({ cursor }).toString()}` : "";
  const response = await send(`/api/games${query}`);
  if (!response) return { ok: false, message: OFFLINE };
  if (!response.ok) return { ok: false, message: FAILED };
  const parsed = LibraryPageSchema.safeParse(await readJson(response));
  return parsed.success ? { ok: true, page: parsed.data } : { ok: false, message: FAILED };
}

/**
 * One saved game, state included (GET /api/games/[id]), to review it or
 * carry on scoring it. The summary is validated with the API schema and
 * the state with the same parser that restores the device's own game.
 */
export async function getGame(id: string): Promise<GetGameResult> {
  const response = await send(gamePath(id));
  if (!response) return { ok: false, message: OFFLINE };
  if (response.status === 404) return { ok: false, message: GONE };
  if (!response.ok) return { ok: false, message: GAME_FAILED };

  const body = await readJson(response);
  const game = isRecord(body) ? body.game : undefined;
  const entry = LibraryEntrySchema.safeParse(game);
  const state = isRecord(game) ? parseGameRecord(game.state) : null;
  if (!entry.success || !state) return { ok: false, message: GAME_FAILED };
  return { ok: true, game: { entry: entry.data, state } };
}

/** Deletes a saved game (DELETE /api/games/[id]). Already gone counts. */
export async function deleteGame(id: string): Promise<DeleteGameResult> {
  const response = await send(gamePath(id), { method: "DELETE" });
  if (!response) return { ok: false, message: OFFLINE };
  return response.ok || response.status === 404
    ? { ok: true }
    : { ok: false, message: DELETE_FAILED };
}
