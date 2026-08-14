"use client";

/**
 * Write-through save for signed-in games (feature 009-account-library,
 * US2, Research R-01).
 *
 * `WriteThroughController` is the framework-free heart of the mechanism:
 * it takes a stream of committed game records (from Zustand's
 * `subscribeWithSelector`), debounces them at 250 ms, POSTs the very
 * first commit to `/api/games`, and PATCHes every subsequent commit to
 * `/api/games/[id]`. Every request carries a fresh `Idempotency-Key`
 * header so client retries stay safe (Constitution Principle VI).
 *
 * `useLibraryWriteThrough` is the React hook that binds the controller
 * to the store's subscription lifecycle.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { PersistedGameRecord } from "@/lib/persistence";
import { useGameStore } from "@/lib/store";
import { newIdempotencyKey } from "./idempotency";

type StoreState = ReturnType<typeof useGameStore.getState>;

/** Coarse lifecycle of the last write, for surfacing to the UI. */
export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Project the current store into the persisted slice we write through.
 * Shared by the live subscription and by imperative `saveNow` so both
 * paths serialize the exact same shape.
 */
function projectPersistedRecord(s: StoreState): PersistedGameRecord {
  return {
    schemaVersion: 1,
    homeTeam: s.homeTeam,
    awayTeam: s.awayTeam,
    settings: s.settings,
    status: s.status,
    currentPeriod: s.currentPeriod,
    events: s.events,
    possession: s.possession,
    possessionArrow: s.possessionArrow,
    onCourt: s.onCourt,
  } satisfies PersistedGameRecord;
}

export interface WriteThroughOptions {
  signedIn: boolean;
  debounceMs?: number;
  /** Notified whenever the last write's status changes. */
  onStatus?: (status: SaveStatus) => void;
}

export interface CommittedResponse {
  game: { id: string };
}

export class WriteThroughController {
  private signedIn: boolean;
  private debounceMs: number;
  private onStatus?: (status: SaveStatus) => void;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: PersistedGameRecord | null = null;
  private inflight: Promise<void> | null = null;
  private gameId: string | null = null;

  constructor(opts: WriteThroughOptions) {
    this.signedIn = opts.signedIn;
    this.debounceMs = opts.debounceMs ?? 250;
    this.onStatus = opts.onStatus;
  }

  private setStatus(status: SaveStatus): void {
    this.onStatus?.(status);
  }

  /**
   * Imperatively persist the caller's current store state now, bypassing
   * the debounce window. Powers the manual "Save" button. Resolves once
   * the write settles; status is reported via `onStatus`.
   */
  async saveNow(record: PersistedGameRecord): Promise<void> {
    if (!this.signedIn) return;
    this.pending = record;
    await this.flush();
  }

  /**
   * Record a fresh committed record. Coalesced with any earlier
   * commits still inside the debounce window — only the latest record
   * survives.
   */
  onCommit(record: PersistedGameRecord): void {
    if (!this.signedIn) return;
    this.pending = record;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, this.debounceMs);
  }

  /**
   * Force any pending record out immediately, bypassing the debounce
   * window. Called by the hook on unmount so an in-flight scoring session
   * doesn't lose its last commit when the user closes the tab.
   */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.signedIn) {
      this.pending = null;
      return;
    }
    if (this.inflight) {
      // Chain behind the current write so we don't race two writes for
      // the same game.
      await this.inflight;
    }
    const record = this.pending;
    if (!record) return;
    this.pending = null;
    this.inflight = this.send(record).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  /** For tests / integration wiring — the id of the created game row. */
  currentGameId(): string | null {
    return this.gameId;
  }

  /** Adopt an existing game id (e.g. when the user just opened a game
   *  from the library and mutations should PATCH instead of POST). */
  setGameId(id: string | null): void {
    this.gameId = id;
  }

  private async send(record: PersistedGameRecord): Promise<void> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Idempotency-Key": newIdempotencyKey(),
    };
    const body = JSON.stringify({ state: record });

    this.setStatus("saving");
    try {
      if (this.gameId === null) {
        const res = await fetch("/api/games", { method: "POST", headers, body });
        if (!res.ok) {
          // A failed POST leaves the controller in a state where the next
          // commit tries POST again (safer than mis-attributing to a random
          // id). The app-shell surfaces its own retry affordance.
          this.setStatus("error");
          return;
        }
        const parsed = (await res.json()) as CommittedResponse;
        this.gameId = parsed.game.id;
        this.setStatus("saved");
        return;
      }

      const res = await fetch(`/api/games/${this.gameId}`, {
        method: "PATCH",
        headers,
        body,
      });
      this.setStatus(res.ok ? "saved" : "error");
    } catch {
      this.setStatus("error");
    }
  }
}

export interface WriteThroughHandle {
  /** Persist the current store state immediately (manual "Save" button). */
  saveNow: () => Promise<void>;
  /** Status of the most recent write (manual or automatic). */
  status: SaveStatus;
}

/**
 * React hook: subscribe to the Zustand store's committed record and
 * feed each mutation to a `WriteThroughController`. No-op writes when the
 * caller is not signed in. Returns an imperative `saveNow` handle plus the
 * latest save status for surfacing to the UI.
 */
export function useLibraryWriteThrough(opts: {
  signedIn: boolean;
  initialGameId?: string | null;
}): WriteThroughHandle {
  const controllerRef = useRef<WriteThroughController | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");

  useEffect(() => {
    const controller = new WriteThroughController({
      signedIn: opts.signedIn,
      onStatus: setStatus,
    });
    if (opts.initialGameId) controller.setGameId(opts.initialGameId);
    controllerRef.current = controller;

    // Subscribe to the persisted slice's fields. `subscribeWithSelector`
    // fires once per shallow-equal change on the projected shape.
    const unsubscribe = useGameStore.subscribe(
      projectPersistedRecord,
      (record) => {
        controller.onCommit(record);
      },
      { equalityFn: Object.is },
    );

    return () => {
      unsubscribe();
      // Best-effort final flush so the last commit isn't stranded.
      void controller.flush();
      controllerRef.current = null;
    };
    // The hook is expected to be called at a stable session boundary;
    // toggling `signedIn` re-runs the effect to swap controllers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.signedIn]);

  const saveNow = useCallback(async () => {
    const controller = controllerRef.current;
    if (!controller) return;
    await controller.saveNow(projectPersistedRecord(useGameStore.getState()));
  }, []);

  return { saveNow, status };
}
