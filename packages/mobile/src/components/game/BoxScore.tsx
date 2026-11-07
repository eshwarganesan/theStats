import { FOUL_OUT_THRESHOLD, type PlayerStats, type Side } from "@thestats/core";
import { ScrollView, Text, View } from "react-native";

import { cx } from "@/lib/cx";
import { useGame } from "@/lib/gameContext";
import { useGameStats } from "@/lib/useGameStats";

const TABULAR = { fontVariant: ["tabular-nums" as const] };

type Line = Omit<PlayerStats, "playerId" | "fouledOut">;

const COLUMNS: readonly { label: string; value: (line: Line) => string }[] = [
  { label: "PTS", value: (l) => String(l.points) },
  { label: "FG", value: (l) => `${l.fgMade}-${l.fgAttempted}` },
  { label: "3P", value: (l) => `${l.threePtMade}-${l.threePtAttempted}` },
  { label: "FT", value: (l) => `${l.ftMade}-${l.ftAttempted}` },
  { label: "OREB", value: (l) => String(l.reboundsOff) },
  { label: "DREB", value: (l) => String(l.reboundsDef) },
  { label: "REB", value: (l) => String(l.rebounds) },
  { label: "AST", value: (l) => String(l.assists) },
  { label: "STL", value: (l) => String(l.steals) },
  { label: "BLK", value: (l) => String(l.blocks) },
  { label: "TO", value: (l) => String(l.turnovers) },
  { label: "PF", value: (l) => String(l.fouls) },
];

const ZERO: Line = {
  points: 0,
  fgMade: 0,
  fgAttempted: 0,
  threePtMade: 0,
  threePtAttempted: 0,
  ftMade: 0,
  ftAttempted: 0,
  reboundsOff: 0,
  reboundsDef: 0,
  rebounds: 0,
  assists: 0,
  steals: 0,
  blocks: 0,
  turnovers: 0,
  fouls: 0,
};

function total(lines: PlayerStats[]): Line {
  return lines.reduce<Line>(
    (sum, l) => ({
      points: sum.points + l.points,
      fgMade: sum.fgMade + l.fgMade,
      fgAttempted: sum.fgAttempted + l.fgAttempted,
      threePtMade: sum.threePtMade + l.threePtMade,
      threePtAttempted: sum.threePtAttempted + l.threePtAttempted,
      ftMade: sum.ftMade + l.ftMade,
      ftAttempted: sum.ftAttempted + l.ftAttempted,
      reboundsOff: sum.reboundsOff + l.reboundsOff,
      reboundsDef: sum.reboundsDef + l.reboundsDef,
      rebounds: sum.rebounds + l.rebounds,
      assists: sum.assists + l.assists,
      steals: sum.steals + l.steals,
      blocks: sum.blocks + l.blocks,
      turnovers: sum.turnovers + l.turnovers,
      fouls: sum.fouls + l.fouls,
    }),
    ZERO,
  );
}

/** What VoiceOver reads for a row, instead of a dozen bare numbers. */
function spoken(l: Line): string {
  return (
    `${l.points} points, ${l.fgMade} of ${l.fgAttempted} field goals, ` +
    `${l.threePtMade} of ${l.threePtAttempted} threes, ${l.ftMade} of ${l.ftAttempted} free throws, ` +
    `${l.rebounds} rebounds, ${l.assists} assists, ${l.steals} steals, ${l.blocks} blocks, ` +
    `${l.turnovers} turnovers, ${l.fouls} fouls`
  );
}

/**
 * One team's box score, as on web's Stats tab: a row per rostered player
 * (* starter, C captain), then the team totals. Scrolls sideways on a phone.
 */
export function BoxScore({ side }: { side: Side }) {
  const team = useGame((s) => (side === "home" ? s.homeTeam : s.awayTeam));
  const foulOutAt = useGame((s) => FOUL_OUT_THRESHOLD[s.settings.format]);
  const stats = useGameStats()[side];
  const totals = total(stats.players);

  return (
    <View className="rounded-xl border border-surface-border bg-surface-elevated">
      <View className="flex-row items-center justify-between border-b border-surface-border px-4 py-3">
        <View className="shrink flex-row items-center gap-2">
          <View className="h-2 w-2" style={{ backgroundColor: team.color }} />
          <Text accessibilityRole="header" className="shrink text-lg font-bold text-ink" numberOfLines={1}>
            {team.name}
          </Text>
        </View>
        <View className="flex-row gap-4">
          <Text className="text-xs uppercase text-ink-muted" style={TABULAR}>
            Timeouts {stats.timeoutsTaken}/{stats.timeoutsTaken + stats.timeoutsRemaining}
          </Text>
          <Text className="text-xs uppercase text-ink-muted" style={TABULAR}>
            Team fouls {stats.totalFouls}
          </Text>
        </View>
      </View>
      <ScrollView horizontal contentContainerClassName="min-w-full flex-col">
        <Row cells={COLUMNS.map((c) => c.label)} number="#" name="Player" header />
        {team.roster.map((player) => {
          const line = stats.players.find((p) => p.playerId === player.id);
          if (!line) return null;
          const marks = `${player.isStarter ? " *" : ""}${player.isCaptain ? " C" : ""}`;
          return (
            <Row
              key={player.id}
              number={player.number}
              name={`${player.name}${marks}`}
              cells={COLUMNS.map((c) => c.value(line))}
              accessibilityLabel={`${player.name}, number ${player.number}: ${spoken(line)}${line.fouledOut ? ", fouled out" : ""}`}
              dim={line.fouledOut}
              warnFouls={line.fouls >= foulOutAt - 1}
            />
          );
        })}
        <Row
          number=""
          name="Total"
          cells={COLUMNS.map((c) => c.value(totals))}
          accessibilityLabel={`${team.name} total: ${spoken(totals)}`}
          total
        />
      </ScrollView>
    </View>
  );
}

function Row({
  number,
  name,
  cells,
  accessibilityLabel,
  header = false,
  total: isTotal = false,
  dim = false,
  warnFouls = false,
}: {
  number: string;
  name: string;
  cells: string[];
  accessibilityLabel?: string;
  header?: boolean;
  total?: boolean;
  dim?: boolean;
  warnFouls?: boolean;
}) {
  const text = header
    ? "text-[10px] uppercase tracking-wider text-ink-dim"
    : cx("text-sm", dim ? "text-ink-dim" : "text-ink-muted");
  return (
    <View
      accessible={!header}
      accessibilityLabel={accessibilityLabel}
      className={cx(
        "flex-row items-center border-b border-surface-border/40 py-2",
        isTotal && "border-b-0 border-t-2 border-t-surface-border bg-surface-raised",
      )}
    >
      <Text className={cx("w-12 pl-4", text)} style={TABULAR}>
        {number}
      </Text>
      <Text className={cx("w-44", text, isTotal && "text-xs uppercase tracking-wider")} numberOfLines={1}>
        {name}
      </Text>
      {cells.map((cell, i) => (
        <Text
          key={COLUMNS[i]?.label ?? i}
          className={cx(
            "w-14 text-center",
            text,
            i === 0 && !header && "font-medium text-ink",
            i === cells.length - 1 && warnFouls && "text-danger",
          )}
          style={TABULAR}
        >
          {cell}
        </Text>
      ))}
    </View>
  );
}
