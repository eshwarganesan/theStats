"use client";

import { useState } from "react";
import { useGameStore } from "@/lib/store";
import { formatClock, formatPeriod } from "@thestats/core";
import { cn } from "@/lib/utils";
import { describeEvent, isEditableEvent } from "@thestats/app";
import type { EditableEvent, GameEvent, Team } from "@thestats/core";
import { EditEventModal } from "./EditEventModal";
import { DeleteEventConfirmModal } from "./DeleteEventConfirmModal";

export interface GameLogProps {
  /**
   * When set, hides the Edit / Delete affordances so the log renders
   * strictly read-only. Used by the account library's review view
   * for a finished game (feature 009-account-library US4, FR-020).
   */
  readOnly?: boolean;
  /**
   * When provided, GameLog renders these events + teams instead of
   * reading from the Zustand store. Used by the review view to display
   * a saved game record without disturbing any active in-progress game.
   * All three fields must be provided together.
   */
  source?: {
    events: GameEvent[];
    homeTeam: Team;
    awayTeam: Team;
    periods: number;
  };
}

export function GameLog({ readOnly = false, source }: GameLogProps = {}) {
  const storeEvents = useGameStore((s) => s.events);
  const storeHomeTeam = useGameStore((s) => s.homeTeam);
  const storeAwayTeam = useGameStore((s) => s.awayTeam);
  const storePeriods = useGameStore((s) => s.settings.periods);

  const events = source?.events ?? storeEvents;
  const homeTeam = source?.homeTeam ?? storeHomeTeam;
  const awayTeam = source?.awayTeam ?? storeAwayTeam;
  const periods = source?.periods ?? storePeriods;

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
              onEdit={!readOnly && isEditableEvent(ev) ? () => setEditing(ev) : undefined}
              onDelete={!readOnly && isEditableEvent(ev) ? () => setDeleting(ev) : undefined}
            />
          ))}
        </ul>
      )}

      {!readOnly ? (
        <>
          <EditEventModal event={editing} onClose={() => setEditing(null)} />
          <DeleteEventConfirmModal
            event={deleting}
            onClose={() => setDeleting(null)}
          />
        </>
      ) : null}
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
  const descriptor = describeEvent(event, homeTeam, awayTeam);
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
