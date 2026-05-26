"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useGameStore } from "@/lib/store";
import {
  FOUL_LABELS,
  SCORE_LABELS,
  STAT_LABELS,
} from "@/lib/constants";
import { formatClock, parseClock, cn } from "@/lib/utils";
import type {
  EditableEvent,
  EditEventPatch,
  FoulKind,
  ScoreKind,
  Side,
  StatKind,
} from "@/lib/types";

interface EditEventModalProps {
  /** The event being edited. `null` closes the modal. */
  event: EditableEvent | null;
  /** Called when the user dismisses the modal (Cancel, backdrop, Escape).
   *  Discards any pending changes. */
  onClose: () => void;
}

/**
 * Shared edit modal for the four editable play-by-play event types
 * (score / foul / stat / timeout). The visible fields adapt to the
 * event's `type`. Identity fields (id, type, period, timestamp) are
 * never editable here; the store enforces this too. See
 * `specs/004-edit-play-events/contracts/ui-contracts.md` for the
 * field-rule table.
 */
export function EditEventModal({ event, onClose }: EditEventModalProps) {
  const homeTeam = useGameStore((s) => s.homeTeam);
  const awayTeam = useGameStore((s) => s.awayTeam);
  const settings = useGameStore((s) => s.settings);
  const editEvent = useGameStore((s) => s.editEvent);

  // ── Draft state ──────────────────────────────────────────────────────
  // We keep a string for clockAt (mm:ss text input) so parsing happens
  // at save time; this matches how ClockEditor in the live clock works.
  const [clockDraft, setClockDraft] = useState<string>("");
  const [sideDraft, setSideDraft] = useState<Side>("home");
  // `null` means "user changed side; please pick a player". For initial
  // mount we pre-fill from the event.
  const [playerIdDraft, setPlayerIdDraft] = useState<string | null>(null);
  const [scoreKindDraft, setScoreKindDraft] = useState<ScoreKind>("2pt");
  const [foulKindDraft, setFoulKindDraft] = useState<FoulKind>("personal");
  const [statKindDraft, setStatKindDraft] = useState<StatKind>("rebound-off");
  const [madeDraft, setMadeDraft] = useState<boolean>(true);

  // Re-seed all draft fields whenever the event prop changes (open or swap).
  useEffect(() => {
    if (!event) return;
    setClockDraft(formatClock(event.clockAt));
    setSideDraft(event.side);
    if (event.type === "score") {
      setPlayerIdDraft(event.playerId);
      setScoreKindDraft(event.kind);
      setMadeDraft(event.made);
    } else if (event.type === "foul") {
      setPlayerIdDraft(event.playerId);
      setFoulKindDraft(event.kind);
    } else if (event.type === "stat") {
      setPlayerIdDraft(event.playerId);
      setStatKindDraft(event.kind);
    } else {
      // timeout: no player or kind
      setPlayerIdDraft(null);
    }
  }, [event]);

  // ── Derived rosters / validation ────────────────────────────────────
  const team = sideDraft === "home" ? homeTeam : awayTeam;
  const roster = team.roster;

  const periodLength =
    event && event.period > settings.periods
      ? settings.overtimeSeconds
      : settings.periodSeconds;

  const parsedClock = useMemo(() => parseClock(clockDraft), [clockDraft]);
  const clockError = useMemo<string | null>(() => {
    if (parsedClock === null) return "Clock is invalid; use mm:ss or seconds.";
    if (parsedClock < 0 || parsedClock > periodLength) {
      return `Clock is out of range — must be between 00:00 and ${formatClock(periodLength)}.`;
    }
    return null;
  }, [parsedClock, periodLength]);

  const needsPlayer =
    event !== null && event.type !== "timeout";
  const playerMissing = needsPlayer && playerIdDraft === null;
  const canSave = !clockError && !playerMissing;

  if (!event) return null;

  // ── Handlers ────────────────────────────────────────────────────────
  const handleSideChange = (next: Side) => {
    setSideDraft(next);
    // If the player belongs to the other side, reset selection so save is
    // blocked until a new player is chosen.
    if (needsPlayer && playerIdDraft !== null) {
      const onNewSide = (next === "home" ? homeTeam : awayTeam).roster.some(
        (p) => p.id === playerIdDraft,
      );
      if (!onNewSide) setPlayerIdDraft(null);
    }
  };

  const handleSave = () => {
    if (!canSave || parsedClock === null) return;

    // Build a minimal patch: include only the fields that actually changed
    // relative to the underlying event.
    const buildPatch = (): EditEventPatch | null => {
      if (event.type === "score") {
        const patch: Extract<EditEventPatch, { type: "score" }> = {
          type: "score",
        };
        if (parsedClock !== event.clockAt) patch.clockAt = parsedClock;
        if (sideDraft !== event.side) patch.side = sideDraft;
        if (playerIdDraft !== null && playerIdDraft !== event.playerId)
          patch.playerId = playerIdDraft;
        if (scoreKindDraft !== event.kind) patch.kind = scoreKindDraft;
        if (madeDraft !== event.made) patch.made = madeDraft;
        return patch;
      }
      if (event.type === "foul") {
        const patch: Extract<EditEventPatch, { type: "foul" }> = {
          type: "foul",
        };
        if (parsedClock !== event.clockAt) patch.clockAt = parsedClock;
        if (sideDraft !== event.side) patch.side = sideDraft;
        if (playerIdDraft !== null && playerIdDraft !== event.playerId)
          patch.playerId = playerIdDraft;
        if (foulKindDraft !== event.kind) patch.kind = foulKindDraft;
        return patch;
      }
      if (event.type === "stat") {
        const patch: Extract<EditEventPatch, { type: "stat" }> = {
          type: "stat",
        };
        if (parsedClock !== event.clockAt) patch.clockAt = parsedClock;
        if (sideDraft !== event.side) patch.side = sideDraft;
        if (playerIdDraft !== null && playerIdDraft !== event.playerId)
          patch.playerId = playerIdDraft;
        if (statKindDraft !== event.kind) patch.kind = statKindDraft;
        return patch;
      }
      // timeout
      const patch: Extract<EditEventPatch, { type: "timeout" }> = {
        type: "timeout",
      };
      if (parsedClock !== event.clockAt) patch.clockAt = parsedClock;
      if (sideDraft !== event.side) patch.side = sideDraft;
      return patch;
    };

    const patch = buildPatch();
    if (patch) editEvent(event.id, patch);
    onClose();
  };

  return (
    <Modal
      open={event !== null}
      onClose={onClose}
      title="Edit play"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {/* clockAt */}
        <Field label="Clock time" htmlFor="edit-clock">
          <input
            id="edit-clock"
            type="text"
            inputMode="numeric"
            value={clockDraft}
            onChange={(e) => setClockDraft(e.target.value)}
            aria-label="Clock time"
            aria-invalid={clockError !== null}
            className={cn(
              "w-full bg-surface-raised border border-surface-border px-3 py-2",
              "font-mono tabular text-ink",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              clockError && "border-danger",
            )}
          />
          {clockError ? (
            <p className="text-xs text-danger mt-1" role="alert">
              {clockError}
            </p>
          ) : null}
        </Field>

        {/* side */}
        <Field label="Side" htmlFor="edit-side">
          <select
            id="edit-side"
            value={sideDraft}
            onChange={(e) => handleSideChange(e.target.value as Side)}
            aria-label="Side"
            className="w-full bg-surface-raised border border-surface-border px-3 py-2 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <option value="home">{homeTeam.name || "Home"}</option>
            <option value="away">{awayTeam.name || "Away"}</option>
          </select>
        </Field>

        {/* player (score, foul, stat only) */}
        {event.type !== "timeout" ? (
          <Field label="Player" htmlFor="edit-player">
            <select
              id="edit-player"
              value={playerIdDraft ?? ""}
              onChange={(e) =>
                setPlayerIdDraft(e.target.value === "" ? null : e.target.value)
              }
              aria-label="Player"
              className="w-full bg-surface-raised border border-surface-border px-3 py-2 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {playerIdDraft === null ? (
                <option value="">— select a player —</option>
              ) : null}
              {roster.map((p) => (
                <option key={p.id} value={p.id}>
                  #{p.number} {p.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        {/* kind — varies by type */}
        {event.type === "score" ? (
          <Field label="Shot kind" htmlFor="edit-score-kind">
            <select
              id="edit-score-kind"
              value={scoreKindDraft}
              onChange={(e) => setScoreKindDraft(e.target.value as ScoreKind)}
              aria-label="Shot kind"
              className="w-full bg-surface-raised border border-surface-border px-3 py-2 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {(Object.entries(SCORE_LABELS) as Array<[ScoreKind, string]>).map(
                ([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </Field>
        ) : null}

        {event.type === "foul" ? (
          <Field label="Foul kind" htmlFor="edit-foul-kind">
            <select
              id="edit-foul-kind"
              value={foulKindDraft}
              onChange={(e) => setFoulKindDraft(e.target.value as FoulKind)}
              aria-label="Foul kind"
              className="w-full bg-surface-raised border border-surface-border px-3 py-2 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {(Object.entries(FOUL_LABELS) as Array<[FoulKind, string]>).map(
                ([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </Field>
        ) : null}

        {event.type === "stat" ? (
          <Field label="Stat kind" htmlFor="edit-stat-kind">
            <select
              id="edit-stat-kind"
              value={statKindDraft}
              onChange={(e) => setStatKindDraft(e.target.value as StatKind)}
              aria-label="Stat kind"
              className="w-full bg-surface-raised border border-surface-border px-3 py-2 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {(Object.entries(STAT_LABELS) as Array<[StatKind, string]>).map(
                ([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </Field>
        ) : null}

        {/* made (score only) */}
        {event.type === "score" ? (
          <Field label="Made" htmlFor="edit-made">
            <label className="inline-flex items-center gap-2">
              <input
                id="edit-made"
                type="checkbox"
                checked={madeDraft}
                onChange={(e) => setMadeDraft(e.target.checked)}
                aria-label="Made"
                className="w-4 h-4"
              />
              <span className="text-sm text-ink-muted">
                Shot was made (uncheck for a miss)
              </span>
            </label>
          </Field>
        ) : null}
      </div>
    </Modal>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label-eyebrow mb-1 block">
        {label}
      </label>
      {children}
    </div>
  );
}
