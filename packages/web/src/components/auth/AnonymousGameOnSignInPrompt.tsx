"use client";

/**
 * Post-sign-in prompt for feature 009-account-library (FR-024).
 *
 * After a successful sign-in on a device that already holds an anonymous
 * in-progress game (per feature 006's local `localStorage` persistence),
 * this component blocks the redirect until the user picks one of three
 * explicit choices:
 *
 *   - **Save to my account**: POST the local game to `/api/games`, clear
 *     the local key, then hand control back so the caller can redirect.
 *   - **Keep local only**: leave the local key untouched, resolve
 *     immediately.
 *   - **Discard**: clear the local key, resolve immediately.
 *
 * If no local game exists, `onResolved` fires synchronously on mount so
 * the parent proceeds without showing anything.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  GAME_STORAGE_KEY,
  clearPersistedGame,
  parseGameRecord,
  type PersistedGameRecord,
} from "@/lib/persistence";
import { newIdempotencyKey } from "@/lib/games/idempotency";
import { useWriteThrough } from "@/components/shell/WriteThroughMount";

export interface AnonymousGameOnSignInPromptProps {
  /**
   * Called exactly once when the user has made a choice (or when there
   * is no local game to resolve). The caller uses this to un-block the
   * redirect it deferred to show the prompt.
   */
  onResolved: () => void;
}

/**
 * Read the anonymous local game from `localStorage`. Zustand's persist
 * middleware stores under `{ state: PersistedGameRecord, version: 1 }` —
 * this helper unwraps the envelope and validates the record.
 */
function readLocalGame(): PersistedGameRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(GAME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: unknown } | unknown;
    const candidate =
      typeof parsed === "object" && parsed !== null && "state" in parsed
        ? (parsed as { state: unknown }).state
        : parsed;
    return parseGameRecord(candidate);
  } catch {
    return null;
  }
}

export function AnonymousGameOnSignInPrompt({
  onResolved,
}: AnonymousGameOnSignInPromptProps) {
  const localGame = useMemo(() => readLocalGame(), []);
  const writeThrough = useWriteThrough();
  const [pending, setPending] = useState<null | "save" | "keep" | "discard">(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // No local game — resolve on mount so the caller proceeds immediately.
  useEffect(() => {
    if (!localGame && !done) {
      setDone(true);
      onResolved();
    }
  }, [localGame, done, onResolved]);

  const handleSave = useCallback(async () => {
    if (!localGame) return;
    setPending("save");
    setError(null);
    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": newIdempotencyKey(),
        },
        body: JSON.stringify({ state: localGame }),
      });
      if (!res.ok) throw new Error(`save failed: ${res.status}`);
      // Hand the new row id to the write-through controller so any later
      // signed-in mutation PATCHes this game instead of POSTing a duplicate
      // library entry.
      const body = (await res.json()) as { game?: { id?: string } };
      if (body.game?.id) writeThrough?.adoptGameId(body.game.id);
      clearPersistedGame();
      setDone(true);
      onResolved();
    } catch {
      setError("Couldn't save your game. Try again or pick another option.");
      setPending(null);
    }
  }, [localGame, onResolved, writeThrough]);

  const handleKeep = useCallback(() => {
    setPending("keep");
    setDone(true);
    onResolved();
  }, [onResolved]);

  const handleDiscard = useCallback(() => {
    setPending("discard");
    clearPersistedGame();
    setDone(true);
    onResolved();
  }, [onResolved]);

  if (!localGame) return null;

  return (
    <Modal
      open={!done}
      onClose={() => {
        // Prompt is intentionally blocking — closing without a choice
        // is not offered. Escape-to-close does nothing meaningful.
      }}
      title="You have an unsaved game"
      size="md"
      footer={
        <div className="flex flex-col sm:flex-row justify-end gap-2 w-full">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDiscard}
            disabled={pending !== null}
          >
            Discard
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleKeep}
            disabled={pending !== null}
          >
            Keep local
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleSave()}
            disabled={pending !== null}
          >
            {pending === "save" ? "Saving…" : "Save to my account"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3 text-sm text-ink">
        <p>
          Signing in gives you a saved library across devices. We noticed an
          in-progress game on this device from before you signed in.
        </p>
        <p>
          <span className="font-medium">
            {localGame.homeTeam.name} vs {localGame.awayTeam.name}
          </span>{" "}
          — period {localGame.currentPeriod}, {localGame.events.length} events.
        </p>
        {error ? (
          <p className="text-danger">{error}</p>
        ) : null}
      </div>
    </Modal>
  );
}
