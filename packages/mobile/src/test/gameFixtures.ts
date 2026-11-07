import type { Side } from "@thestats/core";

import { useGameStore } from "@/lib/store";

const NAMES: Record<Side, string[]> = {
  home: ["Jordan", "Pippen", "Rodman", "Kerr", "Kukoc", "Harper"],
  away: ["Bird", "McHale", "Parish", "Ainge", "Walton", "Johnson"],
};

/**
 * Fills both rosters with six players, the first five starting, and
 * names the teams. The store must be reset first.
 */
export function rosterTeams(): void {
  const store = useGameStore.getState();
  store.setTeam("home", { name: "Central", tag: "CEN" });
  store.setTeam("away", { name: "Eastridge", tag: "EST" });
  for (const side of ["home", "away"] as const) {
    NAMES[side].forEach((name, i) => {
      store.addPlayer(side, {
        number: String(side === "home" ? 10 + i : 30 + i),
        name,
        isStarter: i < 5,
        isCaptain: i === 0,
      });
    });
  }
}

/** A game that has tipped off, with the clock stopped. */
export function startLiveGame(): void {
  useGameStore.getState().resetAll();
  rosterTeams();
  const prepared = useGameStore.getState().prepareGame();
  if (!prepared.ok) throw new Error(`fixture: ${prepared.reason}`);
  useGameStore.getState().startGame();
}

/** The rostered player with jersey `number`. */
export function player(side: Side, number: string) {
  const team = side === "home" ? useGameStore.getState().homeTeam : useGameStore.getState().awayTeam;
  const found = team.roster.find((p) => p.number === number);
  if (!found) throw new Error(`fixture: no #${number} on ${side}`);
  return found;
}
