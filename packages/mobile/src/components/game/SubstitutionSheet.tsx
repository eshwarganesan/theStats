import type { Player, Side } from "@thestats/core";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { cx } from "@/lib/cx";
import { useGameStore } from "@/lib/store";
import { useLatest } from "@/lib/useLatest";

const NO_ONE: string[] = [];

/**
 * Swap one player on court for one on the bench. Stays mounted (see
 * PlayerActionSheet) and starts with nothing picked each time it opens.
 */
export function SubstitutionSheet({ side, onClose }: { side: Side | null; onClose: () => void }) {
  const shown = useLatest(side);
  const team = useGameStore((s) => (shown === "away" ? s.awayTeam : s.homeTeam));
  const onCourt = useGameStore((s) => (shown ? s.onCourt[shown] : NO_ONE));
  const substitute = useGameStore((s) => s.substitute);
  const [outId, setOutId] = useState<string | null>(null);
  const [inId, setInId] = useState<string | null>(null);
  const [openedFor, setOpenedFor] = useState(side);
  if (side !== openedFor) {
    setOpenedFor(side);
    setOutId(null);
    setInId(null);
  }

  const court = team.roster.filter((p) => onCourt.includes(p.id));
  const bench = team.roster.filter((p) => !onCourt.includes(p.id));

  const confirm = () => {
    if (!shown || !outId || !inId) return;
    substitute(shown, outId, inId);
    onClose();
  };

  return (
    <Sheet
      visible={side !== null}
      title={`Substitution — ${team.name}`}
      onClose={onClose}
      footer={
        <>
          <Button label="Cancel" variant="ghost" onPress={onClose} />
          <Button label="Confirm swap" variant="primary" disabled={!outId || !inId} onPress={confirm} />
        </>
      }
    >
      <View className="gap-5 md:flex-row">
        <Column
          label="Player out (on court)"
          action="out"
          players={court}
          selectedId={outId}
          onSelect={setOutId}
          empty="No players on court."
        />
        <Column
          label="Player in (bench)"
          action="in"
          players={bench}
          selectedId={inId}
          onSelect={setInId}
          empty="No one on the bench."
        />
      </View>
    </Sheet>
  );
}

function Column({
  label,
  action,
  players,
  selectedId,
  onSelect,
  empty,
}: {
  label: string;
  action: "in" | "out";
  players: Player[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  empty: string;
}) {
  return (
    <View className="flex-1 gap-2">
      <Text className="text-xs uppercase tracking-widest text-ink-muted">{label}</Text>
      {players.length === 0 ? (
        <Text className="rounded-lg border border-dashed border-surface-border py-6 text-center text-sm italic text-ink-dim">
          {empty}
        </Text>
      ) : (
        players.map((p) => {
          const selected = selectedId === p.id;
          return (
            <Pressable
              key={p.id}
              accessibilityRole="radio"
              accessibilityLabel={`${p.name} ${action}`}
              accessibilityState={{ checked: selected }}
              onPress={() => onSelect(p.id)}
              className={cx(
                "flex-row items-center gap-3 rounded-lg border px-3 py-2.5",
                selected ? "border-accent bg-accent/5" : "border-surface-border bg-surface-raised",
              )}
            >
              <Text className="w-8 text-right text-ink-muted">{p.number}</Text>
              <Text className="text-sm text-ink">{p.name}</Text>
            </Pressable>
          );
        })
      )}
    </View>
  );
}
