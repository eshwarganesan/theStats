import { LibraryPageSchema, type LibraryPage } from "@thestats/app";

import { apiFetch } from "@/lib/api";

export type ListGamesResult = { ok: true; page: LibraryPage } | { ok: false; message: string };

const OFFLINE = "Can't reach theStats. Check your connection and try again.";
const FAILED = "Couldn't load your games. Please try again.";

/**
 * One page of the signed-in user's game library (GET /api/games), most
 * recent activity first. Pass the previous page's `nextCursor` for the
 * next one. The response is validated before it reaches the UI.
 */
export async function listGames(cursor?: string | null): Promise<ListGamesResult> {
  const query = cursor ? `?${new URLSearchParams({ cursor }).toString()}` : "";
  let response: Response;
  try {
    response = await apiFetch(`/api/games${query}`);
  } catch {
    return { ok: false, message: OFFLINE };
  }
  if (!response.ok) return { ok: false, message: FAILED };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, message: FAILED };
  }
  const parsed = LibraryPageSchema.safeParse(body);
  return parsed.success ? { ok: true, page: parsed.data } : { ok: false, message: FAILED };
}
