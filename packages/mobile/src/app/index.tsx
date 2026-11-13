import type { LibraryEntry } from "@thestats/app";
import type { GameStatus } from "@thestats/core";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GameLibrary } from "@/components/GameLibrary";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ProfileButton } from "@/components/shell/ProfileButton";
import { Button } from "@/components/ui/Button";
import { confirm } from "@/lib/confirm";
import { flushGameSync, hasUnsavedGameChanges, startNewGame } from "@/lib/gameSync";
import { continueFromLibrary, deleteSavedGame } from "@/lib/libraryActions";
import { useGameStore } from "@/lib/store";
import { useGameStats } from "@/lib/useGameStats";

const STATUS_LABELS: Record<GameStatus, string> = {
  setup: "Not started",
  ready: "Ready to tip off",
  live: "Live",
  timeout: "Timeout",
  "period-break": "Period break",
  finished: "Final",
};

/**
 * Home: the game on this device, with the way into setup or the live
 * console, above the signed-in user's game library. Tapping a saved game
 * reviews it when it's final and carries on scoring it otherwise; the
 * library reloads whenever Home comes back into view, e.g. after a game.
 * Its header has the navigation sidebar's menu button and the profile
 * button, which opens Account in one tap (feature 018).
 */
export default function HomeScreen() {
  const router = useRouter();
  const [opening, setOpening] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const seen = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (seen.current) setRefreshKey((key) => key + 1);
      seen.current = true;
    }, []),
  );

  async function open(entry: LibraryEntry) {
    if (entry.status === "finished") {
      router.push(`/games/${entry.id}`);
      return;
    }
    setOpening(entry.id);
    try {
      if (await continueFromLibrary(entry)) router.push("/game");
    } finally {
      setOpening(null);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top", "left", "right"]}>
      {/* Overhangs the padding like the menu button, keeping the bar 56 pt tall. */}
      <ScreenHeader right={<ProfileButton className="-my-1" />} />
      <GameLibrary
        header={<DeviceGame />}
        onOpen={open}
        onDelete={deleteSavedGame}
        openingId={opening}
        refreshKey={refreshKey}
      />
    </SafeAreaView>
  );
}

function DeviceGame() {
  const router = useRouter();
  const homeTeam = useGameStore((s) => s.homeTeam);
  const awayTeam = useGameStore((s) => s.awayTeam);
  const status = useGameStore((s) => s.status);
  const stats = useGameStats();
  const [pending, setPending] = useState(false);

  const inProgress = status !== "setup" && status !== "finished";

  /**
   * Replaces the device's game with a fresh one. The current game stays
   * in the library, so this only asks first when it's still being played
   * or its latest changes haven't been saved to the account yet.
   */
  async function onNewGame() {
    if (
      inProgress &&
      !(await confirm(
        "Start a new game?",
        "The game on this device stays in your games list.",
        "New game",
      ))
    ) {
      return;
    }
    setPending(true);
    try {
      await flushGameSync();
      if (
        hasUnsavedGameChanges() &&
        !(await confirm(
          "Not saved yet",
          "The latest changes to this game haven't reached your account. Start a new game anyway and lose them?",
          "Start anyway",
          "destructive",
        ))
      ) {
        return;
      }
      startNewGame();
      router.push("/setup");
    } finally {
      setPending(false);
    }
  }

  return (
    <View className="items-center gap-6 pb-8 pt-6">
      <Text className="text-4xl font-bold text-ink md:text-6xl">theStats</Text>

      <View className="w-full rounded-xl border border-surface-border bg-surface-elevated p-6">
        <Text className="mb-4 text-center text-sm uppercase tracking-widest text-ink-muted">
          {STATUS_LABELS[status]}
        </Text>
        <View className="flex-row items-center justify-between">
          <TeamScore name={homeTeam.name} points={stats.home.points} accent="text-home" />
          <Text className="text-2xl text-ink-dim">vs</Text>
          <TeamScore name={awayTeam.name} points={stats.away.points} accent="text-away" />
        </View>
      </View>

      <View className="w-full flex-row justify-center gap-3">
        {status === "setup" ? (
          <Button
            label="Set up a game"
            variant="primary"
            size="lg"
            onPress={() => router.push("/setup")}
          />
        ) : inProgress ? (
          <>
            <Button
              label="Continue game"
              variant="primary"
              size="lg"
              onPress={() => router.push("/game")}
            />
            <Button label="New game" size="lg" disabled={pending} onPress={onNewGame} />
          </>
        ) : (
          <>
            <Button
              label="New game"
              variant="primary"
              size="lg"
              disabled={pending}
              onPress={onNewGame}
            />
            <Button label="View game" size="lg" onPress={() => router.push("/game")} />
          </>
        )}
      </View>
    </View>
  );
}

function TeamScore({
  name,
  points,
  accent,
}: {
  name: string;
  points: number;
  accent: string;
}) {
  return (
    <View className="flex-1 items-center gap-2">
      <Text className={`text-5xl font-bold md:text-7xl ${accent}`}>{points}</Text>
      <Text className="text-center text-base text-ink" numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}
