import {
  FOUL_LABELS,
  STAT_LABELS,
  TEAM_TURNOVER_LABELS,
  formatClock,
  type GameEvent,
  type ScoreKind,
  type Side,
} from "@thestats/core";

/** The parts of a team that describing one of its events needs. */
export interface EventTeam {
  tag: string;
  roster: ReadonlyArray<{ id: string; name: string; number: string }>;
}

/** How the play-by-play shows one event. Shared by web and iOS. */
export interface EventDescription {
  text: string;
  /** The team the event belongs to, for the row's colour bar. */
  sideColor: Side | null;
  /** Scores, awards, clock adjustments and period changes stand out. */
  emphasis: boolean;
  /** Short badge, e.g. "3PT" or "FOUL". */
  tag?: string;
  tagColor: "accent" | "danger" | "muted";
}

export function describeEvent(ev: GameEvent, home: EventTeam, away: EventTeam): EventDescription {
  const playerFor = (side: Side, id: string) =>
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
    case "team-turnover": {
      const tag = ev.side === "home" ? home.tag : away.tag;
      return {
        text: `${tag} — ${TEAM_TURNOVER_LABELS[ev.kind]} (team TO)`,
        sideColor: ev.side,
        emphasis: false,
        tag: "TO",
        tagColor: "muted",
      };
    }
    case "team-score-adjust": {
      const tag = ev.side === "home" ? home.tag : away.tag;
      const reason = ev.reason.trim();
      return {
        text: `${tag} +${ev.points}${reason ? ` — ${reason}` : ""}`,
        sideColor: ev.side,
        emphasis: true,
        tag: "+PTS",
        tagColor: "accent",
      };
    }
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

function labelScore(kind: ScoreKind): string {
  return kind === "ft" ? "1" : kind === "3pt" ? "3" : "2";
}
