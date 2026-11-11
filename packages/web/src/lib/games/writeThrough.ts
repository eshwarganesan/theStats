"use client";

/**
 * Write-through save for signed-in games (feature 009-account-library,
 * US2, Research R-01).
 *
 * The debounce / POST-then-PATCH / idempotency logic lives in the shared
 * `WriteThroughController` (`@thestats/app`), which iOS uses too. This
 * module binds it to the web store: `useLibraryWriteThrough` feeds every
 * committed change of the game record to a controller that writes to
 * the page's own origin with the session cookie.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useGameStore } from "@/lib/store";
import { handleAccountGone } from "@/lib/account/account-gone";
import {
  WriteThroughController,
  subscribeToGameRecord,
  toPersistedGameRecord,
  type SaveStatus,
} from "@thestats/app";

export interface WriteThroughHandle {
  /** Persist the current store state immediately (manual "Save" button). */
  saveNow: () => Promise<void>;
  /** Status of the most recent write (manual or automatic). */
  status: SaveStatus;
  /**
   * Adopt an existing server game id so subsequent commits PATCH that row
   * instead of POSTing a new one. Used when the game was uploaded outside
   * the controller (e.g. the "Save to my account" prompt) so the next
   * write-through mutation doesn't create a duplicate library entry.
   */
  adoptGameId: (id: string | null) => void;
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
      // A save refused because the account is gone (feature 018, FR-009).
      onAccountGone: () => handleAccountGone("deleted-elsewhere"),
    });
    if (opts.initialGameId) controller.setGameId(opts.initialGameId);
    controllerRef.current = controller;

    const unsubscribe = subscribeToGameRecord(useGameStore, (record) => {
      controller.onCommit(record);
    });

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
    await controller.saveNow(toPersistedGameRecord(useGameStore.getState()));
  }, []);

  const adoptGameId = useCallback((id: string | null) => {
    controllerRef.current?.setGameId(id);
  }, []);

  return { saveNow, status, adoptGameId };
}
