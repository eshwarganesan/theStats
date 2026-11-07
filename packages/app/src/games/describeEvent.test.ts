import type { GameEvent } from "@thestats/core";
import { describe, expect, it } from "vitest";

import { describeEvent, type EventTeam } from "./describeEvent";

const home: EventTeam = { tag: "CEN", roster: [{ id: "h1", name: "Jordan", number: "23" }] };
const away: EventTeam = {
  tag: "EST",
  roster: [
    { id: "a1", name: "Bird", number: "33" },
    { id: "a2", name: "Magic", number: "32" },
  ],
};

const base = { id: "e1", timestamp: 0, period: 1, clockAt: 300 };

function text(ev: GameEvent) {
  return describeEvent(ev, home, away);
}

describe("describeEvent", () => {
  it("describes made and missed shots with the shooter", () => {
    expect(
      text({ ...base, type: "score", side: "home", playerId: "h1", kind: "3pt", made: true }),
    ).toEqual({
      text: "#23 Jordan scored 3",
      sideColor: "home",
      emphasis: true,
      tag: "3PT",
      tagColor: "accent",
    });
    expect(
      text({ ...base, type: "score", side: "home", playerId: "h1", kind: "2pt", made: true }).tag,
    ).toBe("2PT");
    expect(
      text({ ...base, type: "score", side: "away", playerId: "a1", kind: "ft", made: true }),
    ).toMatchObject({ text: "#33 Bird scored 1", tag: "FT", sideColor: "away" });
    expect(
      text({ ...base, type: "score", side: "away", playerId: "a1", kind: "2pt", made: false }),
    ).toEqual({
      text: "#33 Bird missed 2",
      sideColor: "away",
      emphasis: false,
      tag: "MISS",
      tagColor: "muted",
    });
  });

  it("names a player who is no longer on the roster as Unknown", () => {
    const shot = text({
      ...base,
      type: "score",
      side: "home",
      playerId: "gone",
      kind: "2pt",
      made: true,
    });
    expect(shot.text).toBe("Unknown scored 2");
    expect(
      text({ ...base, type: "foul", side: "home", playerId: "gone", kind: "personal" }).text,
    ).toBe("Unknown — Personal foul");
    expect(
      text({ ...base, type: "stat", side: "home", playerId: "gone", kind: "steal" }).text,
    ).toBe("Unknown — Steal");
  });

  it("describes fouls and stats", () => {
    expect(
      text({ ...base, type: "foul", side: "away", playerId: "a2", kind: "technical" }),
    ).toEqual({
      text: "#32 Magic — Technical foul",
      sideColor: "away",
      emphasis: false,
      tag: "FOUL",
      tagColor: "danger",
    });
    expect(
      text({ ...base, type: "stat", side: "home", playerId: "h1", kind: "rebound-def" }),
    ).toEqual({
      text: "#23 Jordan — Def. Reb",
      sideColor: "home",
      emphasis: false,
      tagColor: "muted",
    });
  });

  it("describes substitutions, with ? for players it can't find", () => {
    expect(
      text({ ...base, type: "substitution", side: "away", playerInId: "a2", playerOutId: "a1" }),
    ).toMatchObject({ text: "Sub: #32 Magic in for #33 Bird", tag: "SUB" });
    expect(
      text({ ...base, type: "substitution", side: "home", playerInId: "x", playerOutId: "h1" })
        .text,
    ).toBe("Sub: #?  in for #23 Jordan");
  });

  it("describes team events by tag", () => {
    expect(text({ ...base, type: "timeout", side: "home" })).toMatchObject({
      text: "CEN timeout",
      tag: "TO",
    });
    expect(text({ ...base, type: "timeout", side: "away" }).text).toBe("EST timeout");
    expect(text({ ...base, type: "team-turnover", side: "away", kind: "24-second" }).text).toBe(
      "EST — 24-Second Violation (team TO)",
    );
    expect(text({ ...base, type: "team-turnover", side: "home", kind: "8-second" }).text).toBe(
      "CEN — 8-Second Violation (team TO)",
    );
    expect(
      text({ ...base, type: "team-score-adjust", side: "home", points: 2, reason: " technical " }),
    ).toEqual({
      text: "CEN +2 — technical",
      sideColor: "home",
      emphasis: true,
      tag: "+PTS",
      tagColor: "accent",
    });
    expect(
      text({ ...base, type: "team-score-adjust", side: "away", points: 5, reason: "" }).text,
    ).toBe("EST +5");
  });

  it("describes clock and period events without a team", () => {
    expect(
      text({ ...base, type: "clock", action: "adjust", from: 125, to: 120, clockAt: 120 }),
    ).toEqual({
      text: "Clock adjusted 02:05 → 02:00",
      sideColor: null,
      emphasis: true,
      tag: "ADJ",
      tagColor: "accent",
    });
    expect(text({ ...base, type: "clock", action: "stop" })).toEqual({
      text: "Clock stop",
      sideColor: null,
      emphasis: false,
      tagColor: "muted",
    });
    expect(text({ ...base, type: "period", action: "start" })).toMatchObject({
      text: "Period start",
      tag: "TIP",
    });
    expect(text({ ...base, type: "period", action: "end" }).tag).toBe("END");
  });
});
