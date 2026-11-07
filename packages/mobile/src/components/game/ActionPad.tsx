import { Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { useGameStore } from "@/lib/store";

/** The label for leaving a period break, as on web. */
export function nextPeriodLabel(currentPeriod: number, periods: number): string {
  if (currentPeriod >= periods) return "Start overtime";
  if (periods % 2 === 0 && currentPeriod === periods / 2) return "Start second half";
  return "Start next quarter";
}

const HINTS = {
  setup: "Finish setup to start.",
  ready: "Tap Tip off when the game starts.",
  live: "Tap a player, then pick what they did.",
  timeout: "Timeout. Tap End timeout to resume.",
  "period-break": "Break. Start the next period when ready.",
  finished: "Game complete.",
} as const;

/**
 * The centre column: one primary button for whatever comes next (tip
 * off, start or stop the clock, end the period, end a timeout, start the
 * next period), plus Undo and End period while play is on.
 */
export function ActionPad() {
  const status = useGameStore((s) => s.status);
  const clockRunning = useGameStore((s) => s.clockRunning);
  const atZero = useGameStore((s) => s.clockSeconds <= 0);
  const currentPeriod = useGameStore((s) => s.currentPeriod);
  const periods = useGameStore((s) => s.settings.periods);
  const hasEvents = useGameStore((s) => s.events.length > 0);
  const { startGame, startClock, stopClock, endTimeout, endPeriod, startNextPeriod, undoLastEvent } =
    useGameStore.getState();

  const inBreak = status === "timeout" || status === "period-break";

  const primary = () => {
    switch (status) {
      case "setup":
        return null;
      case "ready":
        return <Button label="Tip off" variant="primary" size="xl" onPress={startGame} />;
      case "timeout":
        return <Button label="End timeout" variant="primary" size="xl" onPress={endTimeout} />;
      case "period-break":
        return (
          <Button
            label={nextPeriodLabel(currentPeriod, periods)}
            variant="primary"
            size="xl"
            onPress={startNextPeriod}
          />
        );
      case "finished":
        return (
          <View className="items-center rounded-lg border border-surface-border py-5">
            <Text className="text-2xl font-bold uppercase tracking-wider text-accent">Final</Text>
          </View>
        );
      case "live":
        if (atZero) {
          return <Button label="End period" variant="danger" size="xl" onPress={endPeriod} />;
        }
        return clockRunning ? (
          <Button label="Stop clock" variant="secondary" size="xl" onPress={stopClock} />
        ) : (
          <Button label="Start clock" variant="primary" size="xl" onPress={startClock} />
        );
    }
  };

  return (
    <View className="gap-3 rounded-xl border border-surface-border bg-surface-elevated p-3">
      {primary()}
      {!inBreak && status !== "finished" ? (
        <View className="flex-row gap-2">
          <Button
            label="← Undo"
            accessibilityLabel="Undo last play"
            variant="ghost"
            disabled={!hasEvents}
            onPress={undoLastEvent}
            className="flex-1"
          />
          <Button
            label="End period"
            variant="ghost"
            disabled={status !== "live"}
            onPress={endPeriod}
            className="flex-1"
          />
        </View>
      ) : null}
      <Text className="px-2 text-center text-xs leading-relaxed text-ink-dim">{HINTS[status]}</Text>
    </View>
  );
}
