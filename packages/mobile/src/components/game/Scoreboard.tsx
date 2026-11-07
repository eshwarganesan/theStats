import { formatPeriod, type Side } from "@thestats/core";
import { Text, View } from "react-native";

import { cx } from "@/lib/cx";
import { useGameStore } from "@/lib/store";
import { useGameStats } from "@/lib/useGameStats";

import { ClockPanel } from "./GameClock";
import { PossessionArrow } from "./PossessionArrow";

const TABULAR = { fontVariant: ["tabular-nums" as const] };

/** Score, clock, period and possession, always at the top of the game. */
export function Scoreboard() {
  const periods = useGameStore((s) => s.settings.periods);
  const arrowEnabled = useGameStore((s) => s.settings.possessionArrowEnabled);
  const currentPeriod = useGameStore((s) => s.currentPeriod);
  const status = useGameStore((s) => s.status);

  const label =
    status === "finished"
      ? "Final"
      : status === "period-break"
        ? "Break"
        : status === "timeout"
          ? "Timeout"
          : formatPeriod(currentPeriod, periods);

  return (
    <View className="flex-row items-stretch rounded-xl border border-surface-border bg-surface-elevated">
      <TeamScore side="home" />
      <View className="min-w-[200px] items-center justify-center gap-2 border-x border-surface-border px-4 py-3 md:min-w-[260px]">
        <Text className="text-xs uppercase tracking-widest text-ink-muted">{label}</Text>
        <ClockPanel />
        {arrowEnabled ? <PossessionArrow /> : null}
      </View>
      <TeamScore side="away" />
    </View>
  );
}

function TeamScore({ side }: { side: Side }) {
  const team = useGameStore((s) => (side === "home" ? s.homeTeam : s.awayTeam));
  const bonusAt = useGameStore((s) => s.settings.bonusFoulThreshold);
  const hasPossession = useGameStore((s) => s.possession === side);
  const stats = useGameStats()[side];
  const away = side === "away";

  return (
    <View
      className={cx("flex-1 items-center gap-4 px-4 py-3 md:px-6", away ? "flex-row-reverse" : "flex-row")}
    >
      <View className={cx("shrink gap-1", away && "items-end")}>
        <View className="flex-row items-center gap-2">
          <View className="h-2 w-2" style={{ backgroundColor: team.color }} />
          <Text className="text-xs uppercase tracking-widest text-ink-muted">{team.tag}</Text>
          {hasPossession ? (
            <View accessibilityLabel="In possession" className="h-1.5 w-1.5 rounded-full bg-accent" />
          ) : null}
        </View>
        <Text className="text-lg font-bold text-ink md:text-xl" numberOfLines={1}>
          {team.name}
        </Text>
        <View className="flex-row gap-3">
          <Text className="text-[11px] uppercase tracking-wider text-ink-muted">
            TO {stats.timeoutsRemaining}
          </Text>
          {stats.fouls >= bonusAt ? (
            <Text className="text-[11px] uppercase tracking-wider text-accent">Bonus</Text>
          ) : null}
        </View>
      </View>
      <Text
        accessibilityLabel={`${team.name} ${stats.points}`}
        className={cx("text-5xl font-bold text-ink md:text-6xl", away ? "mr-auto" : "ml-auto")}
        style={TABULAR}
      >
        {stats.points}
      </Text>
    </View>
  );
}
