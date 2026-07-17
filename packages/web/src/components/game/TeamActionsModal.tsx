"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useGameStore } from "@/lib/store";
import { TEAM_TURNOVER_KINDS } from "@thestats/core";
import type { Side } from "@thestats/core";
import { cn } from "@/lib/utils";

interface TeamActionsModalProps {
  open: boolean;
  onClose: () => void;
  side: Side | null;
  /** Game-clock reading captured at the moment the Team Actions button was
   *  tapped, so a recorded action reflects when it happened. */
  capturedClockAt: number | null;
}

/**
 * Team-level actions modal (feature 008). Hosts two sections:
 *   1. Violation turnovers — team-attributed, no player. Available only while
 *      the game is live or in a break (a turnover can't happen otherwise).
 *   2. Additive score awards — a positive whole-point award with an optional
 *      free-text reason (e.g. missing-jersey +5, technical +2). Never
 *      subtracts. Available from the pre-tip "ready" state onward.
 */
export function TeamActionsModal({
  open,
  onClose,
  side,
  capturedClockAt,
}: TeamActionsModalProps) {
  const homeTeam = useGameStore((s) => s.homeTeam);
  const awayTeam = useGameStore((s) => s.awayTeam);
  const status = useGameStore((s) => s.status);
  const recordTeamTurnover = useGameStore((s) => s.recordTeamTurnover);
  const recordTeamScoreAdjust = useGameStore((s) => s.recordTeamScoreAdjust);

  const [pointsDraft, setPointsDraft] = useState<string>("");
  const [reasonDraft, setReasonDraft] = useState<string>("");

  // Reset the award form whenever we open for a different side.
  useEffect(() => {
    if (open) {
      setPointsDraft("");
      setReasonDraft("");
    }
  }, [open, side]);

  if (!side) return null;
  const team = side === "home" ? homeTeam : awayTeam;

  // Turnovers can only be recorded during live play or a break (FR-016).
  const turnoversEnabled =
    status === "live" || status === "timeout" || status === "period-break";

  const parsedPoints = Number(pointsDraft);
  const pointsValid =
    pointsDraft.trim() !== "" &&
    Number.isInteger(parsedPoints) &&
    parsedPoints > 0;

  const recordTurnover = (kind: (typeof TEAM_TURNOVER_KINDS)[number]["kind"]) => {
    recordTeamTurnover(side, kind, capturedClockAt ?? undefined);
    onClose();
  };

  const confirmAward = () => {
    if (!pointsValid) return;
    recordTeamScoreAdjust(side, parsedPoints, reasonDraft.trim(), capturedClockAt ?? undefined);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Team Actions — ${team.name}`}
      size="lg"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-6">
        {/* ── Violation turnovers ─────────────────────────────────────── */}
        <section aria-labelledby="team-turnovers-label">
          <p id="team-turnovers-label" className="label-eyebrow mb-2">
            Team turnover (violation)
          </p>
          {!turnoversEnabled ? (
            <p className="text-sm text-ink-dim italic py-2">
              Turnovers can be recorded once the game is live.
            </p>
          ) : null}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {TEAM_TURNOVER_KINDS.map(({ kind, label }) => (
              <button
                key={kind}
                type="button"
                disabled={!turnoversEnabled}
                onClick={() => recordTurnover(kind)}
                className={cn(
                  "h-11 px-2 text-xs font-mono uppercase tracking-wider border text-center",
                  "border-surface-border bg-surface-raised text-ink-muted",
                  "transition-colors hover:border-accent hover:text-ink",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-surface-border",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {/* ── Additive score award ────────────────────────────────────── */}
        <section aria-labelledby="team-award-label">
          <p id="team-award-label" className="label-eyebrow mb-2">
            Adjust score (add points)
          </p>
          <p className="text-xs text-ink-dim mb-3">
            Adds points to {team.name} (e.g. missing-jersey +5, technical +2).
            Points can only be added, never subtracted.
          </p>
          <div className="flex flex-col gap-3">
            <div>
              <label htmlFor="team-award-points" className="label-eyebrow mb-1 block">
                Points
              </label>
              <input
                id="team-award-points"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={pointsDraft}
                onChange={(e) => setPointsDraft(e.target.value)}
                aria-label="Points to add"
                className={cn(
                  "w-full bg-surface-raised border border-surface-border px-3 py-2",
                  "font-mono tabular text-ink",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                )}
              />
            </div>
            <div>
              <label htmlFor="team-award-reason" className="label-eyebrow mb-1 block">
                Reason (optional)
              </label>
              <input
                id="team-award-reason"
                type="text"
                value={reasonDraft}
                onChange={(e) => setReasonDraft(e.target.value)}
                aria-label="Reason"
                placeholder="e.g. missing jersey"
                className={cn(
                  "w-full bg-surface-raised border border-surface-border px-3 py-2",
                  "text-ink",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                )}
              />
            </div>
            <div className="flex justify-end">
              <Button variant="primary" onClick={confirmAward} disabled={!pointsValid}>
                Add points
              </Button>
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}
