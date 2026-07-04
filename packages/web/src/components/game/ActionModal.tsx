"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useGameStore } from "@/lib/store";
import { formatClock, type Side } from "@thestats/core";
import { cn } from "@/lib/utils";
import { ClockNudge } from "./ClockNudge";

interface ActionModalProps {
  open: boolean;
  onClose: () => void;
  side: Side | null;
  playerId: string | null;
  /** Game-clock reading captured at the moment the scorekeeper tapped the
   *  player. Forwarded to every `record*` store call so the recorded
   *  `clockAt` reflects when the action happened, not when this modal was
   *  finally submitted. */
  capturedClockAt: number | null;
}

/**
 * When the scorekeeper taps a player, this modal opens and offers every
 * possible action. We group them into Score / Foul / Stat for quick scanning.
 *
 * All actions dispatch through the store so undo is free.
 */
export function ActionModal({
  open,
  onClose,
  side,
  playerId,
  capturedClockAt,
}: ActionModalProps) {
  const homeTeam = useGameStore((s) => s.homeTeam);
  const awayTeam = useGameStore((s) => s.awayTeam);
  const recordScore = useGameStore((s) => s.recordScore);
  const recordFoul = useGameStore((s) => s.recordFoul);
  const recordStat = useGameStore((s) => s.recordStat);

  if (!side || !playerId) return null;

  const team = side === "home" ? homeTeam : awayTeam;
  const player = team.roster.find((p) => p.id === playerId);
  if (!player) return null;

  const handle = (fn: () => void) => {
    fn();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`#${player.number} ${player.name}`}
      size="lg"
    >
      <div className="flex flex-col gap-5">
        <ClockStrip />

        {capturedClockAt !== null ? (
          <div
            className="flex items-center gap-2 -mt-1"
            data-testid="captured-clock-at"
          >
            <span className="label-eyebrow">Time of play</span>
            <span className="font-display tabular text-base text-ink">
              {formatClock(capturedClockAt)}
            </span>
          </div>
        ) : null}

        <Group label="Scoring">
          <ActionTile
            primary
            label="+2 Made"
            sub="Field goal"
            onClick={() =>
              handle(() =>
                recordScore(side, playerId, "2pt", true, capturedClockAt ?? undefined),
              )
            }
          />
          <ActionTile
            primary
            label="+3 Made"
            sub="Three pointer"
            onClick={() =>
              handle(() =>
                recordScore(side, playerId, "3pt", true, capturedClockAt ?? undefined),
              )
            }
          />
          <ActionTile
            primary
            label="+1 Made"
            sub="Free throw"
            onClick={() =>
              handle(() =>
                recordScore(side, playerId, "ft", true, capturedClockAt ?? undefined),
              )
            }
          />
          <ActionTile
            label="2 Missed"
            sub="Field goal"
            onClick={() =>
              handle(() =>
                recordScore(side, playerId, "2pt", false, capturedClockAt ?? undefined),
              )
            }
          />
          <ActionTile
            label="3 Missed"
            sub="Three pointer"
            onClick={() =>
              handle(() =>
                recordScore(side, playerId, "3pt", false, capturedClockAt ?? undefined),
              )
            }
          />
          <ActionTile
            label="1 Missed"
            sub="Free throw"
            onClick={() =>
              handle(() =>
                recordScore(side, playerId, "ft", false, capturedClockAt ?? undefined),
              )
            }
          />
        </Group>

        <Group label="Stats">
          <ActionTile
            label="Off. Rebound"
            onClick={() =>
              handle(() =>
                recordStat(side, playerId, "rebound-off", capturedClockAt ?? undefined),
              )
            }
          />
          <ActionTile
            label="Def. Rebound"
            onClick={() =>
              handle(() =>
                recordStat(side, playerId, "rebound-def", capturedClockAt ?? undefined),
              )
            }
          />
          <ActionTile
            label="Assist"
            onClick={() =>
              handle(() =>
                recordStat(side, playerId, "assist", capturedClockAt ?? undefined),
              )
            }
          />
          <ActionTile
            label="Steal"
            onClick={() =>
              handle(() =>
                recordStat(side, playerId, "steal", capturedClockAt ?? undefined),
              )
            }
          />
          <ActionTile
            label="Block"
            onClick={() =>
              handle(() =>
                recordStat(side, playerId, "block", capturedClockAt ?? undefined),
              )
            }
          />
          <ActionTile
            label="Turnover"
            onClick={() =>
              handle(() =>
                recordStat(side, playerId, "turnover", capturedClockAt ?? undefined),
              )
            }
          />
        </Group>

        <Group label="Fouls">
          <ActionTile
            variant="danger"
            label="Personal"
            onClick={() =>
              handle(() =>
                recordFoul(side, playerId, "personal", capturedClockAt ?? undefined),
              )
            }
          />
          <ActionTile
            variant="danger"
            label="Technical"
            onClick={() =>
              handle(() =>
                recordFoul(side, playerId, "technical", capturedClockAt ?? undefined),
              )
            }
          />
          <ActionTile
            variant="danger"
            label="Unsportsmanlike"
            onClick={() =>
              handle(() =>
                recordFoul(
                  side,
                  playerId,
                  "unsportsmanlike",
                  capturedClockAt ?? undefined,
                ),
              )
            }
          />
          <ActionTile
            variant="danger"
            label="Disqualifying"
            onClick={() =>
              handle(() =>
                recordFoul(
                  side,
                  playerId,
                  "disqualifying",
                  capturedClockAt ?? undefined,
                ),
              )
            }
          />
          <ActionTile
            variant="danger"
            label="Offensive"
            onClick={() =>
              handle(() =>
                recordFoul(side, playerId, "offensive", capturedClockAt ?? undefined),
              )
            }
          />
        </Group>
      </div>

      <div className="mt-5 flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}

/* ── Internals ─────────────────────────────────────────────────────── */

/**
 * Compact live-clock strip mounted at the top of the ActionModal. Lets the
 * scorekeeper stop/start the clock and nudge ±1s without dismissing the
 * modal — mirrors the main `ClockPanel` gating (nudges appear only while
 * the clock is paused, since `adjustClock` no-ops while running).
 *
 * Sized down from the full `ClockPanel` (which uses `text-clock`, tuned
 * for the scoreboard) to sit inside a modal header without dominating it.
 * Full-bleed via negative margins so the bottom border spans the modal
 * width, echoing the modal's own title-bar divider.
 */
function ClockStrip() {
  const clockSeconds = useGameStore((s) => s.clockSeconds);
  const clockRunning = useGameStore((s) => s.clockRunning);
  const status = useGameStore((s) => s.status);
  const startClock = useGameStore((s) => s.startClock);
  const stopClock = useGameStore((s) => s.stopClock);

  const canStart = status === "live" && clockSeconds > 0;
  const showNudge = status === "live" && !clockRunning;

  return (
    <div
      data-testid="modal-clock-strip"
      className="-mx-5 -mt-4 mb-1 px-5 py-3 border-b border-surface-border flex items-center justify-between gap-3"
    >
      <div className="flex items-baseline gap-2">
        <span className="label-eyebrow">Clock</span>
        <span
          className={cn(
            "font-display tabular text-2xl leading-none",
            clockRunning ? "text-ink" : "text-ink-muted",
          )}
        >
          {formatClock(clockSeconds)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {showNudge ? <ClockNudge stepSeconds={1} unitLabel="s" /> : null}
        <Button
          size="sm"
          variant={clockRunning ? "secondary" : "primary"}
          onClick={clockRunning ? stopClock : startClock}
          disabled={!clockRunning && !canStart}
        >
          {clockRunning ? "Stop" : "Start"}
        </Button>
      </div>
    </div>
  );
}

function Group({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="label-eyebrow mb-2">{label}</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">{children}</div>
    </div>
  );
}

interface ActionTileProps {
  label: string;
  sub?: string;
  primary?: boolean;
  variant?: "default" | "danger";
  onClick: () => void;
}

function ActionTile({ label, sub, primary, variant = "default", onClick }: ActionTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-0.5 px-4 py-3 border text-left",
        "transition-all duration-150 hover:border-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        variant === "danger" &&
          "bg-danger/5 border-danger/30 hover:border-danger hover:bg-danger/10",
        variant !== "danger" && primary && "bg-accent/5 border-accent/30",
        variant !== "danger" && !primary && "bg-surface-raised border-surface-border",
      )}
    >
      <span
        className={cn(
          "font-display text-lg leading-none",
          variant === "danger" && "text-danger",
          variant !== "danger" && primary && "text-accent",
        )}
      >
        {label}
      </span>
      {sub ? (
        <span className="text-[0.65rem] font-mono uppercase tracking-wider text-ink-dim">
          {sub}
        </span>
      ) : null}
    </button>
  );
}
