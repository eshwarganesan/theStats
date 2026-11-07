import type { EditableEvent, GameEvent } from "@thestats/core";

/**
 * Whether a play can be edited or deleted from the play-by-play: scores,
 * fouls, stats, timeouts and team plays. Substitutions, clock and period
 * events carry state (the line-up, the game's status) that an edit
 * couldn't keep consistent (spec 004, FR-002).
 */
export function isEditableEvent(ev: GameEvent): ev is EditableEvent {
  return (
    ev.type === "score" ||
    ev.type === "foul" ||
    ev.type === "stat" ||
    ev.type === "timeout" ||
    ev.type === "team-turnover" ||
    ev.type === "team-score-adjust"
  );
}
