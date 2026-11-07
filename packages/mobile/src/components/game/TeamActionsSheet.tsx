import { TEAM_TURNOVER_KINDS, type Side } from "@thestats/core";
import { useState } from "react";
import { Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Sheet } from "@/components/ui/Sheet";
import { useGameStore } from "@/lib/store";
import { useLatest } from "@/lib/useLatest";

export interface TeamAction {
  side: Side;
  /** The clock when Team actions was tapped. */
  clockAt: number;
}

/**
 * Team-level plays (feature 008): violation turnovers, which need live
 * play or a break, and score awards (whole points, added only), which can
 * be posted from before tip-off. Stays mounted (see PlayerActionSheet)
 * and starts with an empty award form each time it opens.
 */
export function TeamActionsSheet({
  action,
  onClose,
}: {
  action: TeamAction | null;
  onClose: () => void;
}) {
  const shown = useLatest(action);
  const teamName = useGameStore((s) => (shown?.side === "away" ? s.awayTeam.name : s.homeTeam.name));
  const status = useGameStore((s) => s.status);
  const { recordTeamTurnover, recordTeamScoreAdjust } = useGameStore.getState();
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [openedFor, setOpenedFor] = useState(action);
  if (action !== openedFor) {
    setOpenedFor(action);
    setPoints("");
    setReason("");
  }

  const turnoversEnabled = status === "live" || status === "timeout" || status === "period-break";
  const parsed = Number(points);
  const pointsValid = points.trim() !== "" && Number.isInteger(parsed) && parsed > 0;

  const record = (fn: (side: Side, clockAt: number) => void) => {
    if (!shown) return;
    fn(shown.side, shown.clockAt);
    onClose();
  };

  return (
    <Sheet visible={action !== null} title={`Team actions — ${teamName}`} onClose={onClose}>
      <View className="gap-2">
        <Text accessibilityRole="header" className="text-xs uppercase tracking-widest text-ink-muted">
          Team turnover (violation)
        </Text>
        {!turnoversEnabled ? (
          <Text className="text-sm italic text-ink-dim">
            Turnovers can be recorded once the game is live.
          </Text>
        ) : null}
        <View className="-m-1 flex-row flex-wrap">
          {TEAM_TURNOVER_KINDS.map(({ kind, label }) => (
            <View key={kind} className="w-1/2 p-1 md:w-1/3">
              <Button
                label={label}
                size="sm"
                disabled={!turnoversEnabled}
                onPress={() => record((side, clockAt) => recordTeamTurnover(side, kind, clockAt))}
              />
            </View>
          ))}
        </View>
      </View>

      <View className="gap-3">
        <Text accessibilityRole="header" className="text-xs uppercase tracking-widest text-ink-muted">
          Adjust score (add points)
        </Text>
        <Text className="text-xs text-ink-dim">
          Adds points to {teamName} (e.g. missing jersey +5, technical +2). Points can only be added,
          never taken away.
        </Text>
        <TextField
          label="Points to add"
          value={points}
          onChangeText={setPoints}
          keyboardType="number-pad"
        />
        <TextField
          label="Reason (optional)"
          value={reason}
          onChangeText={setReason}
          placeholder="e.g. missing jersey"
        />
        <View className="items-end">
          <Button
            label="Add points"
            variant="primary"
            disabled={!pointsValid}
            onPress={() =>
              record((side, clockAt) => recordTeamScoreAdjust(side, parsed, reason.trim(), clockAt))
            }
          />
        </View>
      </View>
    </Sheet>
  );
}
