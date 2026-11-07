import { computeStats } from "@thestats/core";
import { useMemo } from "react";

import { useGame } from "@/lib/gameContext";

/**
 * Both teams' stats for the game in view (see useGame), folded from its events.
 * Recomputed only when the events, teams, settings or period change, not
 * on clock ticks.
 */
export function useGameStats() {
  const events = useGame((s) => s.events);
  const homeTeam = useGame((s) => s.homeTeam);
  const awayTeam = useGame((s) => s.awayTeam);
  const settings = useGame((s) => s.settings);
  const currentPeriod = useGame((s) => s.currentPeriod);
  return useMemo(
    () => computeStats(events, homeTeam, awayTeam, settings, currentPeriod),
    [events, homeTeam, awayTeam, settings, currentPeriod],
  );
}
