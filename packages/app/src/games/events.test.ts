import type { GameEvent } from "@thestats/core";
import { describe, expect, it } from "vitest";

import { isEditableEvent } from "./events";

const at = { id: "e", timestamp: 0, period: 1, clockAt: 100 };

describe("isEditableEvent", () => {
  it.each<[GameEvent, boolean]>([
    [{ ...at, type: "score", side: "home", playerId: "p", kind: "2pt", made: true }, true],
    [{ ...at, type: "foul", side: "home", playerId: "p", kind: "personal" }, true],
    [{ ...at, type: "stat", side: "away", playerId: "p", kind: "block" }, true],
    [{ ...at, type: "timeout", side: "away" }, true],
    [{ ...at, type: "team-turnover", side: "home", kind: "backcourt" }, true],
    [{ ...at, type: "team-score-adjust", side: "home", points: 2, reason: "" }, true],
    [{ ...at, type: "substitution", side: "home", playerInId: "a", playerOutId: "b" }, false],
    [{ ...at, type: "clock", action: "start" }, false],
    [{ ...at, type: "period", action: "end" }, false],
  ])("%o → %s", (event, editable) => {
    expect(isEditableEvent(event)).toBe(editable);
  });
});
