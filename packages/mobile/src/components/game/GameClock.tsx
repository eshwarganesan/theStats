import { formatClock, parseClock } from "@thestats/core";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { cx } from "@/lib/cx";
import { useGameStore } from "@/lib/store";

const TABULAR = { fontVariant: ["tabular-nums" as const] };

/**
 * The clock readout. During a timeout or period break it shows the break
 * countdown instead, until that reaches zero.
 */
export function GameClock({ size = "lg" }: { size?: "lg" | "sm" }) {
  const clockSeconds = useGameStore((s) => s.clockSeconds);
  const clockRunning = useGameStore((s) => s.clockRunning);
  const status = useGameStore((s) => s.status);
  const breakSeconds = useGameStore((s) => s.breakSeconds);

  const showingBreak = (status === "timeout" || status === "period-break") && breakSeconds > 0;
  const seconds = showingBreak ? breakSeconds : clockSeconds;
  const critical = status === "live" && seconds > 0 && seconds < 60;
  const text = formatClock(seconds);
  const name = showingBreak ? (status === "timeout" ? "Timeout" : "Break") : "Game clock";

  return (
    <Text
      accessibilityLabel={`${name} ${text}`}
      className={cx(
        "font-bold",
        size === "lg" ? "text-6xl md:text-7xl" : "text-2xl",
        critical ? "text-accent" : clockRunning ? "text-ink" : "text-ink-muted",
      )}
      style={TABULAR}
    >
      {text}
    </Text>
  );
}

/**
 * The clock in the scoreboard. While the game is live and the clock is
 * stopped it can be corrected: tap it to type a time, or nudge it by a
 * minute or a second.
 */
export function ClockPanel() {
  const editable = useGameStore((s) => s.status === "live" && !s.clockRunning);
  if (!editable) return <GameClock />;
  return (
    <View className="flex-row items-center gap-2">
      <ClockNudge stepSeconds={60} />
      <ClockEditor />
      <ClockNudge stepSeconds={1} />
    </View>
  );
}

function ClockEditor() {
  const clockSeconds = useGameStore((s) => s.clockSeconds);
  const adjustClock = useGameStore((s) => s.adjustClock);
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Game clock ${formatClock(clockSeconds)}`}
        accessibilityHint="Type a new time"
        onPress={() => setDraft(formatClock(clockSeconds))}
      >
        <GameClock />
      </Pressable>
    );
  }

  const commit = () => {
    const seconds = parseClock(draft);
    if (seconds !== null) adjustClock(seconds);
    setDraft(null);
  };

  return (
    <TextInput
      accessibilityLabel="Clock time, minutes and seconds"
      value={draft}
      onChangeText={setDraft}
      autoFocus
      selectTextOnFocus
      keyboardType="numbers-and-punctuation"
      returnKeyType="done"
      maxLength={7}
      onSubmitEditing={commit}
      onBlur={commit}
      className="min-w-[170px] border-b border-ink-muted text-center text-6xl font-bold text-ink md:text-7xl"
      style={TABULAR}
    />
  );
}

/**
 * ▲/▼ buttons that move the stopped game clock by `stepSeconds`, within
 * the period (or overtime) length. Only shown while the game is live and
 * the clock is stopped, which is when `adjustClock` changes the clock.
 */
export function ClockNudge({ stepSeconds }: { stepSeconds: 1 | 60 }) {
  const clockSeconds = useGameStore((s) => s.clockSeconds);
  const max = useGameStore((s) =>
    s.currentPeriod > s.settings.periods ? s.settings.overtimeSeconds : s.settings.periodSeconds,
  );
  const adjustClock = useGameStore((s) => s.adjustClock);
  const unit = stepSeconds === 60 ? "minute" : "second";
  const nudge = (delta: number) => adjustClock(useGameStore.getState().clockSeconds + delta);

  return (
    <View className="gap-1">
      <NudgeButton
        glyph="▲"
        label={`Add 1 ${unit}`}
        disabled={clockSeconds + stepSeconds > max}
        onPress={() => nudge(stepSeconds)}
      />
      <NudgeButton
        glyph="▼"
        label={`Take off 1 ${unit}`}
        disabled={clockSeconds < stepSeconds}
        onPress={() => nudge(-stepSeconds)}
      />
    </View>
  );
}

function NudgeButton({
  glyph,
  label,
  disabled,
  onPress,
}: {
  glyph: string;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      className={cx(
        "h-9 w-10 items-center justify-center rounded border border-surface-border",
        disabled && "opacity-30",
      )}
    >
      <Text className="text-sm text-ink">{glyph}</Text>
    </Pressable>
  );
}
