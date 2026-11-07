import { FOUL_OUT_THRESHOLD, type Player, type Side } from "@thestats/core";
import { Pressable, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { cx } from "@/lib/cx";
import { useGameStore } from "@/lib/store";
import { useGameStats } from "@/lib/useGameStats";

const TABULAR = { fontVariant: ["tabular-nums" as const] };

/**
 * One team's players on court, as tiles to tap for an action, plus the
 * team's Sub, Team actions and Timeout buttons.
 */
export function TeamPanel({
  side,
  onPlayerPress,
  onSubstitute,
  onTeamActions,
}: {
  side: Side;
  onPlayerPress: (playerId: string) => void;
  onSubstitute: () => void;
  onTeamActions: () => void;
}) {
  const team = useGameStore((s) => (side === "home" ? s.homeTeam : s.awayTeam));
  const onCourt = useGameStore((s) => s.onCourt[side]);
  const status = useGameStore((s) => s.status);
  const format = useGameStore((s) => s.settings.format);
  const recordTimeout = useGameStore((s) => s.recordTimeout);
  const teamStats = useGameStats()[side];

  const finished = status === "finished";
  const players = onCourt
    .map((id) => team.roster.find((p) => p.id === id))
    .filter((p): p is Player => p !== undefined);

  return (
    <View
      className={cx(
        "flex-1 rounded-xl border border-l-4 border-surface-border bg-surface-elevated",
        side === "home" ? "border-l-home" : "border-l-away",
      )}
    >
      <View className="flex-row items-center justify-between border-b border-surface-border px-4 py-3">
        <View className="shrink flex-row items-center gap-2">
          <View className="h-2 w-2" style={{ backgroundColor: team.color }} />
          <Text className="shrink text-base font-bold text-ink" numberOfLines={1}>
            {team.name}
          </Text>
        </View>
        <Text className="text-xs uppercase tracking-widest text-ink-muted">
          Team fouls <Text className="text-ink">{teamStats.fouls}</Text>
        </Text>
      </View>

      <View className="flex-row flex-wrap p-2">
        {players.map((player) => {
          const line = teamStats.players.find((p) => p.playerId === player.id);
          return (
            <View key={player.id} className="w-1/3 p-1 md:w-1/5">
              <PlayerTile
                player={player}
                points={line?.points ?? 0}
                fouls={line?.fouls ?? 0}
                foulOutAt={FOUL_OUT_THRESHOLD[format]}
                disabled={finished}
                onPress={() => onPlayerPress(player.id)}
              />
            </View>
          );
        })}
      </View>

      <View className="flex-row gap-2 border-t border-surface-border p-2">
        <Button
          label="Sub"
          accessibilityLabel={`Substitution, ${team.name}`}
          size="sm"
          variant="ghost"
          disabled={finished}
          onPress={onSubstitute}
          className="flex-1"
        />
        <Button
          label="Team actions"
          accessibilityLabel={`Team actions, ${team.name}`}
          size="sm"
          variant="ghost"
          disabled={status === "setup" || finished}
          onPress={onTeamActions}
          className="flex-1"
        />
        <Button
          label={`Timeout (${teamStats.timeoutsRemaining})`}
          accessibilityLabel={`Timeout, ${team.name}, ${teamStats.timeoutsRemaining} left`}
          size="sm"
          variant="ghost"
          disabled={status !== "live" || teamStats.timeoutsRemaining <= 0}
          onPress={() => recordTimeout(side)}
          className="flex-1"
        />
      </View>
    </View>
  );
}

function PlayerTile({
  player,
  points,
  fouls,
  foulOutAt,
  disabled,
  onPress,
}: {
  player: Player;
  points: number;
  fouls: number;
  foulOutAt: number;
  disabled: boolean;
  onPress: () => void;
}) {
  const lastName = player.name.split(" ").at(-1) ?? player.name;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${player.name}, number ${player.number}, ${points} points, ${fouls} fouls`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className="aspect-square items-center justify-center rounded-lg border border-surface-border bg-surface-raised p-1"
    >
      <Text className="absolute left-1.5 top-1 text-[10px] text-ink-dim" style={TABULAR}>
        {points} PT
      </Text>
      <Text
        className={cx(
          "absolute right-1.5 top-1 text-[10px]",
          fouls >= foulOutAt - 1 ? "text-danger" : "text-ink-dim",
        )}
        style={TABULAR}
      >
        {fouls}F
      </Text>
      <Text className="text-3xl font-bold text-ink" style={TABULAR}>
        {player.number}
      </Text>
      <Text className="w-full text-center text-[11px] uppercase text-ink-muted" numberOfLines={1}>
        {lastName}
      </Text>
      {player.isCaptain ? (
        <Text className="absolute bottom-1 right-1.5 text-[10px] text-accent">C</Text>
      ) : null}
    </Pressable>
  );
}
