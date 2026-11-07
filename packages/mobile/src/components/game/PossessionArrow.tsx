import type { Side } from "@thestats/core";
import { Pressable, Text, View } from "react-native";

import { cx } from "@/lib/cx";
import { useGameStore } from "@/lib/store";

/**
 * The alternating-possession arrow (feature 007). It starts unset; tapping
 * a side points it there, and tapping the side it already points to does
 * nothing. Read-only once the game is final.
 */
export function PossessionArrow() {
  const direction = useGameStore((s) => s.possessionArrow);
  const setPossessionArrow = useGameStore((s) => s.setPossessionArrow);
  const finished = useGameStore((s) => s.status === "finished");
  const homeName = useGameStore((s) => s.homeTeam.name);
  const awayName = useGameStore((s) => s.awayTeam.name);

  const arrow = (side: Side) => {
    const selected = direction === side;
    return (
      <Pressable
        key={side}
        accessibilityRole="button"
        accessibilityLabel={`Possession arrow: ${side === "home" ? homeName : awayName}`}
        accessibilityState={{ selected, disabled: finished }}
        disabled={finished}
        onPress={() => {
          if (!selected) setPossessionArrow(side);
        }}
        className={cx(
          "rounded border px-3 py-1.5",
          selected ? "border-accent bg-accent" : "border-surface-border bg-surface-raised",
          finished && "opacity-50",
        )}
      >
        <Text className={cx("text-xl", selected ? "text-surface" : "text-ink-muted")}>
          {side === "home" ? "◀" : "▶"}
        </Text>
      </Pressable>
    );
  };

  return (
    <View className="items-center gap-1">
      <Text className="text-[10px] uppercase tracking-widest text-ink-muted">Possession</Text>
      <View className="flex-row gap-1.5">
        {arrow("home")}
        {arrow("away")}
      </View>
    </View>
  );
}
