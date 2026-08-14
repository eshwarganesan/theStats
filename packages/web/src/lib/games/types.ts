/**
 * Domain types for feature 009-account-library.
 *
 * These types are consumed by both the client (LibraryEntry / GameLibrary /
 * write-through hook) and the server (Route Handlers, Server Components).
 * They deliberately live in `packages/web` — not in `@thestats/core` — because
 * `SavedGameRecord.state` references `PersistedGameRecord`, which is web-only
 * (see `packages/web/src/lib/persistence.ts`).
 */
import type { PersistedGameRecord } from "@/lib/persistence";

/** Editable per-user profile row. Mirrors `public.profiles`. */
export interface ProfileRow {
  id: string;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Denormalized library-list row — the shape rendered in the account page's
 *  library section. Matches the summary columns on `public.games` (never
 *  includes the full `state` blob). */
export interface LibraryEntry {
  id: string;
  status: "in-progress" | "finished";
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  eventCount: number;
  currentPeriod: number;
  startedAt: string;
  lastActivityAt: string;
  finishedAt: string | null;
}

/** Full saved game — a LibraryEntry plus the owner id and authoritative
 *  `state` blob. Returned by `GET /api/games/[id]`. */
export interface SavedGameRecord extends LibraryEntry {
  ownerId: string;
  state: PersistedGameRecord;
}

/** One page of library entries. `nextCursor` is the `lastActivityAt` of the
 *  tail entry — pass it as `?cursor=` to `GET /api/games` to fetch the next
 *  page, or `null` when the last page has been returned. */
export interface LibraryPage {
  entries: LibraryEntry[];
  nextCursor: string | null;
}
