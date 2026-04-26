import { useGameStore } from "@/lib/store";
import type { Side } from "@/lib/types";

/**
 * Test helper: seeds the store with two valid 5v5 rosters and runs
 * `prepareGame` so the store ends up in `ready` status. Returns helpers
 * for finding seeded players.
 */
export function seedReadyGame() {
  useGameStore.getState().resetAll();
  for (let i = 0; i < 5; i++) {
    useGameStore.getState().addPlayer("home", {
      number: String(i + 1),
      name: `Home ${i + 1}`,
      isStarter: true,
      isCaptain: i === 0,
    });
  }
  for (let i = 0; i < 5; i++) {
    useGameStore.getState().addPlayer("away", {
      number: String(i + 11),
      name: `Away ${i + 1}`,
      isStarter: true,
      isCaptain: i === 0,
    });
  }
  const result = useGameStore.getState().prepareGame();
  if (!result.ok) throw new Error(`seedReadyGame failed: ${result.reason}`);

  const get = useGameStore.getState;
  return {
    homePlayer: (idx: number) => get().homeTeam.roster[idx]!,
    awayPlayer: (idx: number) => get().awayTeam.roster[idx]!,
    player: (side: Side, idx: number) =>
      side === "home" ? get().homeTeam.roster[idx]! : get().awayTeam.roster[idx]!,
  };
}

/** Adds an extra bench player to the home team. */
export function addBench(side: Side, count = 1) {
  for (let i = 0; i < count; i++) {
    useGameStore.getState().addPlayer(side, {
      number: String(80 + i),
      name: `Bench ${i + 1}`,
      isStarter: false,
      isCaptain: false,
    });
  }
}
