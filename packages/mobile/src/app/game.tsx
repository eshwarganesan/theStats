import type { EditableEvent, Side } from "@thestats/core";
import { useKeepAwake } from "expo-keep-awake";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ActionPad } from "@/components/game/ActionPad";
import { BoxScore } from "@/components/game/BoxScore";
import { EditPlaySheet } from "@/components/game/EditPlaySheet";
import { GameLog } from "@/components/game/GameLog";
import { PlayerActionSheet, type PlayerAction } from "@/components/game/PlayerActionSheet";
import { Scoreboard } from "@/components/game/Scoreboard";
import { Scoresheet } from "@/components/game/Scoresheet";
import { SubstitutionSheet } from "@/components/game/SubstitutionSheet";
import { TeamActionsSheet, type TeamAction } from "@/components/game/TeamActionsSheet";
import { TeamPanel } from "@/components/game/TeamPanel";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { useGameStore } from "@/lib/store";

type Tab = "live" | "stats" | "scoresheet";

const TABS: readonly { value: Tab; label: string }[] = [
  { value: "live", label: "Live" },
  { value: "stats", label: "Stats" },
  { value: "scoresheet", label: "Scoresheet" },
];

/**
 * The game, with web's three tabs under an always-visible scoreboard.
 * Live is the scoring console, laid out for iPad landscape:
 *
 *   ┌───────────────────── Scoreboard ─────────────────────┐
 *   │  Home team   │       Action pad       │  Away team   │
 *   └──────────────────── Play by play ────────────────────┘
 *
 * On a phone the columns stack. Tapping a player opens their actions;
 * the clock reading is captured at the tap, so a play is recorded at the
 * time it happened, not when its action was picked. Tapping a play in
 * the log opens it for editing. Stats is the box score, and Scoresheet
 * the official-style sheet.
 */
export default function GameScreen() {
  const router = useRouter();
  const status = useGameStore((s) => s.status);
  const [tab, setTab] = useState<Tab>("live");
  const [playerAction, setPlayerAction] = useState<PlayerAction | null>(null);
  const [subSide, setSubSide] = useState<Side | null>(null);
  const [teamAction, setTeamAction] = useState<TeamAction | null>(null);
  const [editing, setEditing] = useState<EditableEvent | null>(null);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (status === "setup") {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={["top", "left", "right"]}>
        <ScreenHeader title="Live" onBack={back} />
        <View className="flex-1 items-center justify-center gap-3 p-6">
          <Text className="text-3xl font-bold text-ink">No game in progress</Text>
          <Text className="text-center text-ink-muted">
            Set up both teams before opening the scoring console.
          </Text>
          <Button label="Set up a game" variant="primary" onPress={() => router.replace("/setup")} />
        </View>
      </SafeAreaView>
    );
  }

  const clockNow = () => useGameStore.getState().clockSeconds;
  const panel = (side: Side) => (
    <TeamPanel
      side={side}
      onPlayerPress={(playerId) => setPlayerAction({ side, playerId, clockAt: clockNow() })}
      onSubstitute={() => setSubSide(side)}
      onTeamActions={() => setTeamAction({ side, clockAt: clockNow() })}
    />
  );

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top", "left", "right"]}>
      {status !== "finished" ? <KeepAwake /> : null}
      <ScreenHeader
        title="Live"
        onBack={back}
        right={
          status === "ready" ? (
            <Button
              label="Edit setup"
              size="sm"
              variant="ghost"
              onPress={() => router.replace("/setup")}
            />
          ) : undefined
        }
      />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      <ScrollView contentContainerClassName="gap-4 p-4 pb-12 md:p-6">
        <Scoreboard />
        {tab === "live" ? (
          <>
            <View className="gap-4 md:flex-row">
              {panel("home")}
              <View className="md:w-72">
                <ActionPad />
              </View>
              {panel("away")}
            </View>
            <GameLog onEditPlay={setEditing} />
          </>
        ) : null}
        {tab === "stats" ? (
          <>
            <BoxScore side="home" />
            <BoxScore side="away" />
          </>
        ) : null}
        {tab === "scoresheet" ? <Scoresheet /> : null}
      </ScrollView>
      <PlayerActionSheet action={playerAction} onClose={() => setPlayerAction(null)} />
      <SubstitutionSheet side={subSide} onClose={() => setSubSide(null)} />
      <TeamActionsSheet action={teamAction} onClose={() => setTeamAction(null)} />
      <EditPlaySheet event={editing} onClose={() => setEditing(null)} />
    </SafeAreaView>
  );
}

/** Keeps the screen from locking while a game is under way. */
function KeepAwake() {
  useKeepAwake();
  return null;
}
