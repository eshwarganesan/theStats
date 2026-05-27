"use client";

import { useState } from "react";
import { useGameStore } from "@/lib/store";
import { formatClock, formatPeriod, cn } from "@/lib/utils";
import { FOUL_LABELS, STAT_LABELS } from "@/lib/constants";
import type { EditableEvent, GameEvent } from "@/lib/types";
import { EditEventModal } from "./EditEventModal";
import { DeleteEventConfirmModal } from "./DeleteEventConfirmModal";

/** Event types that get the per-row Edit/Delete affordance.
 *  Substitution, clock, and period rows are intentionally excluded
 *  (Spec FR-002). */
function isEditable(ev: GameEvent): ev is EditableEvent {
  return (
    ev.type === "score" ||
    ev.type === "foul" ||
    ev.type === "stat" ||
    ev.type === "timeout"
  );
}

export function GameLog() {
  const events = useGameStore((s) => s.events);
  const homeTeam = useGameStore((s) => s.homeTeam);
  const awayTeam = useGameStore((s) => s.awayTeam);
  const periods = useGameStore((s) => s.settings.periods);
  const [editing, setEditing] = useState<EditableEvent | null>(null);
  const [deleting, setDeleting] = useState<EditableEvent | null>(null);

  // Most recent events first (UX convention for a live log)
  const reversed = [...events].reverse();

  return (
    <section className="panel flex flex-col min-h-0">
      <header className="h-12 px-4 flex items-center justify-between border-b border-surface-border shrink-0">
        <h3 className="heading-display text-base">Play by Play</h3>
        <span className="label-eyebrow">{events.length} events</span>
      </header>

      {reversed.length === 0 ? (
        <p className="p-5 text-sm text-ink-dim italic">No actions yet.</p>
      ) : (
        <ul className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-surface-border">
          {reversed.map((ev) => (
            <LogRow
              key={ev.id}
              event={ev}
              homeTeam={homeTeam}
              awayTeam={awayTeam}
              periods={periods}
              onEdit={isEditable(ev) ? () => setEditing(ev) : undefined}
              onDelete={isEditable(ev) ? () => setDeleting(ev) : undefined}
            />
          ))}
        </ul>
      )}

      <EditEventModal event={editing} onClose={() => setEditing(null)} />
      <DeleteEventConfirmModal
        event={deleting}
        onClose={() => setDeleting(null)}
      />
    </section>
  );
}

interface LogRowProps {
  event: GameEvent;
  homeTeam: { roster: { id: string; name: string; number: string }[]; tag: string };
  awayTeam: { roster: { id: string; name: string; number: string }[]; tag: string };
  periods: number;
  /** When set, the row renders an Edit button that calls this handler.
   *  Omitted for non-editable event types (substitution, clock, period). */
  onEdit?: () => void;
  /** When set, the row renders a Delete button that calls this handler.
   *  Omitted for non-editable event types (substitution, clock, period). */
  onDelete?: () => void;
}

function LogRow({ event, homeTeam, awayTeam, periods, onEdit, onDelete }: LogRowProps) {
  const descriptor = describe(event, homeTeam, awayTeam);
  return (
    <li className="px-4 py-2 flex items-center gap-3 hover:bg-surface-hover">
      <div className="flex flex-col items-center w-16 shrink-0 font-mono text-[0.7rem] tabular">
        <span className="text-ink-dim">{formatPeriod(event.period, periods)}</span>
        <span className="text-ink-muted">{formatClock(event.clockAt)}</span>
      </div>
      <span
        className={cn(
          "inline-block w-1 h-6 shrink-0",
          descriptor.sideColor === "home" && "bg-home",
          descriptor.sideColor === "away" && "bg-away",
          descriptor.sideColor === null && "bg-ink-dim/40",
        )}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm truncate",
            descriptor.emphasis && "text-ink font-medium",
            !descriptor.emphasis && "text-ink-muted",
          )}
        >
          {descriptor.text}
        </p>
      </div>
      {descriptor.tag ? (
        <span
          className={cn(
            "text-[0.65rem] font-mono uppercase tracking-wider px-2 py-0.5 border shrink-0",
            descriptor.tagColor === "accent" && "border-accent text-accent",
            descriptor.tagColor === "danger" && "border-danger text-danger",
            descriptor.tagColor === "muted" && "border-surface-border text-ink-dim",
          )}
        >
          {descriptor.tag}
        </span>
      ) : null}
      {onEdit ? (
        <button
          type="button"
          aria-label="Edit play"
          onClick={onEdit}
          className="shrink-0 w-7 h-7 flex items-center justify-center text-ink-muted hover:text-ink hover:bg-surface-hover border border-transparent hover:border-surface-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          ✎
        </button>
      ) : null}
      {onDelete ? (
        <button
          type="button"
          aria-label="Delete play"
          onClick={onDelete}
          className="shrink-0 w-7 h-7 flex items-center justify-center text-ink-muted hover:text-danger hover:bg-surface-hover border border-transparent hover:border-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
        >
          ✕
        </button>
      ) : null}
    </li>
  );
}

interface Descriptor {
  text: string;
  sideColor: "home" | "away" | null;
  emphasis: boolean;
  tag?: string;
  tagColor: "accent" | "danger" | "muted";
}

function describe(
  ev: GameEvent,
  home: { roster: { id: string; name: string; number: string }[]; tag: string },
  away: { roster: { id: string; name: string; number: string }[]; tag: string },
): Descriptor {
  const playerFor = (side: "home" | "away", id: string) =>
    (side === "home" ? home : away).roster.find((p) => p.id === id);

  switch (ev.type) {
    case "score": {
      const p = playerFor(ev.side, ev.playerId);
      const name = p ? `#${p.number} ${p.name}` : "Unknown";
      if (!ev.made) {
        return {
          text: `${name} missed ${labelScore(ev.kind)}`,
          sideColor: ev.side,
          emphasis: false,
          tag: "MISS",
          tagColor: "muted",
        };
      }
      return {
        text: `${name} scored ${labelScore(ev.kind)}`,
        sideColor: ev.side,
        emphasis: true,
        tag: ev.kind === "3pt" ? "3PT" : ev.kind === "ft" ? "FT" : "2PT",
        tagColor: "accent",
      };
    }
    case "foul": {
      const p = playerFor(ev.side, ev.playerId);
      const name = p ? `#${p.number} ${p.name}` : "Unknown";
      return {
        text: `${name} — ${FOUL_LABELS[ev.kind]} foul`,
        sideColor: ev.side,
        emphasis: false,
        tag: "FOUL",
        tagColor: "danger",
      };
    }
    case "stat": {
      const p = playerFor(ev.side, ev.playerId);
      const name = p ? `#${p.number} ${p.name}` : "Unknown";
      return {
        text: `${name} — ${STAT_LABELS[ev.kind]}`,
        sideColor: ev.side,
        emphasis: false,
        tagColor: "muted",
      };
    }
    case "substitution": {
      const roster = ev.side === "home" ? home.roster : away.roster;
      const outP = roster.find((p) => p.id === ev.playerOutId);
      const inP = roster.find((p) => p.id === ev.playerInId);
      return {
        text: `Sub: #${inP?.number ?? "?"} ${inP?.name ?? ""} in for #${outP?.number ?? "?"} ${outP?.name ?? ""}`,
        sideColor: ev.side,
        emphasis: false,
        tag: "SUB",
        tagColor: "muted",
      };
    }
    case "timeout":
      return {
        text: `${ev.side === "home" ? home.tag : away.tag} timeout`,
        sideColor: ev.side,
        emphasis: false,
        tag: "TO",
        tagColor: "muted",
      };
    case "clock":
      if (ev.action === "adjust") {
        return {
          text: `Clock adjusted ${formatClock(ev.from)} → ${formatClock(ev.to)}`,
          sideColor: null,
          emphasis: true,
          tag: "ADJ",
          tagColor: "accent",
        };
      }
      return {
        text: `Clock ${ev.action}`,
        sideColor: null,
        emphasis: false,
        tagColor: "muted",
      };
    case "period":
      return {
        text: `Period ${ev.action}`,
        sideColor: null,
        emphasis: true,
        tag: ev.action === "end" ? "END" : "TIP",
        tagColor: "accent",
      };
  }
}

function labelScore(kind: "ft" | "2pt" | "3pt"): string {
  return kind === "ft" ? "1" : kind === "3pt" ? "3" : "2";
}
