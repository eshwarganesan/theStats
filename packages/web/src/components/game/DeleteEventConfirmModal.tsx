"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useGameStore } from "@/lib/store";
import {
  FOUL_LABELS,
  SCORE_LABELS,
  STAT_LABELS,
} from "@/lib/constants";
import { formatClock } from "@/lib/utils";
import type { EditableEvent } from "@/lib/types";

interface DeleteEventConfirmModalProps {
  /** The event awaiting confirmation. `null` closes the dialog. */
  event: EditableEvent | null;
  /** Called when the dialog is dismissed (Cancel, backdrop, Escape).
   *  Does NOT delete. */
  onClose: () => void;
}

/**
 * Confirmation dialog for permanently removing a recorded
 * score/foul/stat/timeout from the play-by-play. Matches the modal
 * idiom of the rest of the app — see Spec FR-015.
 */
export function DeleteEventConfirmModal({
  event,
  onClose,
}: DeleteEventConfirmModalProps) {
  const homeTeam = useGameStore((s) => s.homeTeam);
  const awayTeam = useGameStore((s) => s.awayTeam);
  const deleteEvent = useGameStore((s) => s.deleteEvent);

  if (!event) return null;

  const handleDelete = () => {
    deleteEvent(event.id);
    onClose();
  };

  return (
    <Modal
      open={event !== null}
      onClose={onClose}
      title="Delete play?"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            Delete
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink-muted mb-2">
        This action removes the play from the log permanently. Statistics
        will recompute immediately.
      </p>
      <p className="text-sm text-ink font-medium">
        {describe(event, homeTeam, awayTeam)}
      </p>
    </Modal>
  );
}

/** One-line summary of the play — kept in lockstep with the GameLog's
 *  describe() wording so the user recognizes what they're deleting. */
function describe(
  ev: EditableEvent,
  home: { roster: { id: string; name: string; number: string }[]; tag: string },
  away: { roster: { id: string; name: string; number: string }[]; tag: string },
): string {
  const clockText = formatClock(ev.clockAt);
  if (ev.type === "timeout") {
    const tag = ev.side === "home" ? home.tag : away.tag;
    return `[${clockText}] ${tag} timeout`;
  }
  const roster = ev.side === "home" ? home.roster : away.roster;
  const p = roster.find((pl) => pl.id === ev.playerId);
  const name = p ? `#${p.number} ${p.name}` : "Unknown player";
  if (ev.type === "score") {
    const label = SCORE_LABELS[ev.kind];
    return ev.made
      ? `[${clockText}] ${name} scored ${label}`
      : `[${clockText}] ${name} missed ${label}`;
  }
  if (ev.type === "foul") {
    return `[${clockText}] ${name} — ${FOUL_LABELS[ev.kind]} foul`;
  }
  // stat
  return `[${clockText}] ${name} — ${STAT_LABELS[ev.kind]}`;
}
