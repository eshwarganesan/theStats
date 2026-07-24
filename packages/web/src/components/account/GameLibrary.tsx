"use client";

/**
 * Client-hydrated library view (feature 009-account-library, US2).
 *
 * The first batch of entries is server-rendered — the caller (the
 * account page) fetches it via a scoped Supabase server query and hands
 * it here as `initialEntries`. Subsequent pages are loaded via
 * `GET /api/games?cursor=...` when the load-more sentinel scrolls
 * into view.
 *
 * On fetch failure, the library section shows a retryable error state
 * without unmounting the surrounding profile section — enforcing FR-014.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { LibraryEntry as Entry, LibraryPage } from "@/lib/games/types";
import { Button } from "@/components/ui/Button";
import { LibraryEntry } from "./LibraryEntry";

export interface GameLibraryProps {
  initialEntries: Entry[];
  initialNextCursor: string | null;
}

export function GameLibrary({
  initialEntries,
  initialNextCursor,
}: GameLibraryProps) {
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ cursor: nextCursor });
      const res = await fetch(`/api/games?${params.toString()}`);
      if (!res.ok) throw new Error(`load failed: ${res.status}`);
      const page = (await res.json()) as LibraryPage;
      setEntries((prev) => [...prev, ...page.entries]);
      setNextCursor(page.nextCursor);
    } catch {
      setError("Could not load more games.");
    } finally {
      setLoading(false);
    }
  }, [nextCursor, loading]);

  useEffect(() => {
    if (!nextCursor) return;
    const node = sentinelRef.current;
    if (!node) return;
    if (typeof IntersectionObserver !== "function") return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            void loadMore();
          }
        }
      },
      { rootMargin: "160px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [nextCursor, loadMore]);

  if (entries.length === 0) {
    return (
      <div className="panel p-6 flex flex-col items-center gap-2 text-center">
        <h2 className="heading-display text-xl">Your library is empty</h2>
        <p className="text-sm text-ink-dim">
          Games you play will appear here as you score them — so you can pick
          them back up on any device.
        </p>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <header className="flex items-baseline justify-between">
        <h2 className="heading-display text-xl">Games</h2>
        <span className="text-xs text-ink-dim font-mono">
          {entries.length} {entries.length === 1 ? "game" : "games"}
        </span>
      </header>
      <ul className="flex flex-col gap-2">
        {entries.map((e) => (
          <LibraryEntry
            key={e.id}
            entry={e}
            onDeleted={(id) =>
              setEntries((prev) => prev.filter((x) => x.id !== id))
            }
          />
        ))}
      </ul>
      {nextCursor ? (
        <div
          ref={sentinelRef}
          data-testid="library-load-more"
          className="flex justify-center py-3"
        >
          {loading ? (
            <span className="text-xs text-ink-dim">Loading…</span>
          ) : error ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-danger">{error}</span>
              <Button size="sm" variant="outline" onClick={() => void loadMore()}>
                Retry
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
