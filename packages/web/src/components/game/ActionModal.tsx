"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useGameStore } from "@/lib/store";
import type { Side } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ActionModalProps {
  open: boolean;
  onClose: () => void;
  side: Side | null;
  playerId: string | null;
}

/**
 * When the scorekeeper taps a player, this modal opens and offers every
 * possible action. We group them into Score / Foul / Stat for quick scanning.
 *
 * All actions dispatch through the store so undo is free.
 */
export function ActionModal({ open, onClose, side, playerId }: ActionModalProps) {
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
        <Group label="Scoring">
          <ActionTile
            primary
            label="+2 Made"
            sub="Field goal"
            onClick={() => handle(() => recordScore(side, playerId, "2pt", true))}
          />
          <ActionTile
            label="2 Missed"
            sub="Field goal"
            onClick={() => handle(() => recordScore(side, playerId, "2pt", false))}
          />
          <ActionTile
            primary
            label="+3 Made"
            sub="Three pointer"
            onClick={() => handle(() => recordScore(side, playerId, "3pt", true))}
          />
          <ActionTile
            label="3 Missed"
            sub="Three pointer"
            onClick={() => handle(() => recordScore(side, playerId, "3pt", false))}
          />
          <ActionTile
            primary
            label="+1 Made"
            sub="Free throw"
            onClick={() => handle(() => recordScore(side, playerId, "ft", true))}
          />
          <ActionTile
            label="1 Missed"
            sub="Free throw"
            onClick={() => handle(() => recordScore(side, playerId, "ft", false))}
          />
        </Group>

        <Group label="Fouls">
          <ActionTile
            variant="danger"
            label="Personal"
            onClick={() => handle(() => recordFoul(side, playerId, "personal"))}
          />
          <ActionTile
            variant="danger"
            label="Technical"
            onClick={() => handle(() => recordFoul(side, playerId, "technical"))}
          />
          <ActionTile
            variant="danger"
            label="Unsportsmanlike"
            onClick={() => handle(() => recordFoul(side, playerId, "unsportsmanlike"))}
          />
          <ActionTile
            variant="danger"
            label="Disqualifying"
            onClick={() => handle(() => recordFoul(side, playerId, "disqualifying"))}
          />
        </Group>

        <Group label="Stats">
          <ActionTile
            label="Off. Rebound"
            onClick={() => handle(() => recordStat(side, playerId, "rebound-off"))}
          />
          <ActionTile
            label="Def. Rebound"
            onClick={() => handle(() => recordStat(side, playerId, "rebound-def"))}
          />
          <ActionTile
            label="Assist"
            onClick={() => handle(() => recordStat(side, playerId, "assist"))}
          />
          <ActionTile
            label="Steal"
            onClick={() => handle(() => recordStat(side, playerId, "steal"))}
          />
          <ActionTile
            label="Block"
            onClick={() => handle(() => recordStat(side, playerId, "block"))}
          />
          <ActionTile
            label="Turnover"
            onClick={() => handle(() => recordStat(side, playerId, "turnover"))}
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
