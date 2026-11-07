import { formatClock, type FoulKind, type ScoreKind, type Side, type StatKind } from "@thestats/core";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cx } from "@/lib/cx";
import { useGameStore } from "@/lib/store";
import { useLatest } from "@/lib/useLatest";

import { ClockNudge } from "./GameClock";

const TABULAR = { fontVariant: ["tabular-nums" as const] };

const SHOTS: readonly { kind: ScoreKind; made: boolean; label: string; sub: string }[] = [
  { kind: "2pt", made: true, label: "+2 Made", sub: "Field goal" },
  { kind: "3pt", made: true, label: "+3 Made", sub: "Three pointer" },
  { kind: "ft", made: true, label: "+1 Made", sub: "Free throw" },
  { kind: "2pt", made: false, label: "2 Missed", sub: "Field goal" },
  { kind: "3pt", made: false, label: "3 Missed", sub: "Three pointer" },
  { kind: "ft", made: false, label: "1 Missed", sub: "Free throw" },
];

const STATS: readonly { kind: StatKind; label: string }[] = [
  { kind: "rebound-off", label: "Off. rebound" },
  { kind: "rebound-def", label: "Def. rebound" },
  { kind: "assist", label: "Assist" },
  { kind: "steal", label: "Steal" },
  { kind: "block", label: "Block" },
  { kind: "turnover", label: "Turnover" },
];

const FOULS: readonly { kind: FoulKind; label: string }[] = [
  { kind: "personal", label: "Personal" },
  { kind: "technical", label: "Technical" },
  { kind: "unsportsmanlike", label: "Unsportsmanlike" },
  { kind: "disqualifying", label: "Disqualifying" },
  { kind: "offensive", label: "Offensive" },
];

export interface PlayerAction {
  side: Side;
  playerId: string;
  /** The clock when the player was tapped: when the play happened. */
  clockAt: number;
}

/**
 * Everything a player can do, opened by tapping their tile: scoring,
 * stats and fouls. Each choice is recorded at the clock time captured on
 * the tap, then the sheet closes. The clock strip at the top stops or
 * starts the clock without leaving the sheet.
 */
export function PlayerActionSheet({
  action,
  onClose,
}: {
  action: PlayerAction | null;
  onClose: () => void;
}) {
  // The sheet stays mounted and keeps the last player while it closes:
  // presenting a new iOS modal while another is still animating away
  // can fail, and the next player is often tapped right after a play.
  const shown = useLatest(action);
  const player = useGameStore((s) => {
    if (!shown) return undefined;
    const team = shown.side === "home" ? s.homeTeam : s.awayTeam;
    return team.roster.find((p) => p.id === shown.playerId);
  });

  return (
    <Sheet
      visible={action !== null && player !== undefined}
      title={player ? `#${player.number} ${player.name}` : ""}
      onClose={onClose}
    >
      {shown && player ? <PlayerActions action={shown} onDone={onClose} /> : null}
    </Sheet>
  );
}

function PlayerActions({ action, onDone }: { action: PlayerAction; onDone: () => void }) {
  const { recordScore, recordStat, recordFoul } = useGameStore.getState();
  const { side, playerId, clockAt } = action;
  const record = (fn: () => void) => () => {
    fn();
    onDone();
  };

  return (
    <>
      <ClockStrip />
      <View className="flex-row items-baseline gap-2">
        <Text className="text-xs uppercase tracking-widest text-ink-muted">Time of play</Text>
        <Text className="text-base text-ink" style={TABULAR}>
          {formatClock(clockAt)}
        </Text>
      </View>

      <Group label="Scoring">
        {SHOTS.map((shot) => (
          <Tile
            key={shot.label}
            label={shot.label}
            sub={shot.sub}
            tone={shot.made ? "accent" : "plain"}
            onPress={record(() => recordScore(side, playerId, shot.kind, shot.made, clockAt))}
          />
        ))}
      </Group>
      <Group label="Stats">
        {STATS.map((stat) => (
          <Tile
            key={stat.kind}
            label={stat.label}
            onPress={record(() => recordStat(side, playerId, stat.kind, clockAt))}
          />
        ))}
      </Group>
      <Group label="Fouls">
        {FOULS.map((foul) => (
          <Tile
            key={foul.kind}
            label={foul.label}
            sub="Foul"
            tone="danger"
            onPress={record(() => recordFoul(side, playerId, foul.kind, clockAt))}
          />
        ))}
      </Group>
    </>
  );
}

/** The live clock with Start/Stop, and ±1s nudges while it's stopped. */
function ClockStrip() {
  const clockSeconds = useGameStore((s) => s.clockSeconds);
  const clockRunning = useGameStore((s) => s.clockRunning);
  const status = useGameStore((s) => s.status);
  const { startClock, stopClock } = useGameStore.getState();
  const canStart = status === "live" && clockSeconds > 0;

  return (
    <View className="flex-row items-center justify-between gap-3 rounded-lg border border-surface-border px-4 py-3">
      <View className="flex-row items-baseline gap-2">
        <Text className="text-xs uppercase tracking-widest text-ink-muted">Clock</Text>
        <Text
          className={cx("text-2xl font-bold", clockRunning ? "text-ink" : "text-ink-muted")}
          style={TABULAR}
        >
          {formatClock(clockSeconds)}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        {status === "live" && !clockRunning ? <ClockNudge stepSeconds={1} /> : null}
        <Button
          label={clockRunning ? "Stop" : "Start"}
          accessibilityLabel={clockRunning ? "Stop clock" : "Start clock"}
          size="sm"
          variant={clockRunning ? "secondary" : "primary"}
          disabled={!clockRunning && !canStart}
          onPress={clockRunning ? stopClock : startClock}
        />
      </View>
    </View>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="gap-2">
      <Text className="text-xs uppercase tracking-widest text-ink-muted">{label}</Text>
      <View className="-m-1 flex-row flex-wrap">{children}</View>
    </View>
  );
}

function Tile({
  label,
  sub,
  tone = "plain",
  onPress,
}: {
  label: string;
  sub?: string;
  tone?: "plain" | "accent" | "danger";
  onPress: () => void;
}) {
  return (
    <View className="w-1/2 p-1 md:w-1/3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={sub && tone === "danger" ? `${label} foul` : label}
        onPress={onPress}
        className={cx(
          "gap-0.5 rounded-lg border px-4 py-3",
          tone === "accent" && "border-accent/30 bg-accent/5",
          tone === "danger" && "border-danger/30 bg-danger/5",
          tone === "plain" && "border-surface-border bg-surface-raised",
        )}
      >
        <Text
          className={cx(
            "text-lg font-bold",
            tone === "accent" ? "text-accent" : tone === "danger" ? "text-danger" : "text-ink",
          )}
        >
          {label}
        </Text>
        {sub ? (
          <Text className="text-[11px] uppercase tracking-wider text-ink-dim">{sub}</Text>
        ) : null}
      </Pressable>
    </View>
  );
}
