import { createGameStore, type GameState, type LibraryEntry } from "@thestats/app";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { StoreApi } from "zustand";

import { BoxScore } from "@/components/game/BoxScore";
import { GameLog } from "@/components/game/GameLog";
import { Scoresheet } from "@/components/game/Scoresheet";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { GameStoreProvider, useGame } from "@/lib/gameContext";
import { getGame } from "@/lib/games";
import { deleteSavedGame } from "@/lib/libraryActions";
import { useGameStats } from "@/lib/useGameStats";

type ReviewTab = "stats" | "scoresheet" | "plays";

const TABS: readonly { value: ReviewTab; label: string }[] = [
  { value: "stats", label: "Stats" },
  { value: "scoresheet", label: "Scoresheet" },
  { value: "plays", label: "Plays" },
];

type Load =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "ready"; entry: LibraryEntry; store: StoreApi<GameState> };

const TABULAR = { fontVariant: ["tabular-nums" as const] };

/**
 * A saved game from the library, read-only: its final score, box scores,
 * scoresheet and plays, like web's review page. The game is loaded into
 * its own store, so the game on this device is untouched. As on web, the
 * header opens the navigation sidebar and a link above the game goes back.
 */
export default function ReviewScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<ReviewTab>("stats");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let current = true;
    void getGame(id).then((result) => {
      if (!current) return;
      if (!result.ok) {
        setLoad({ status: "failed", message: result.message });
        return;
      }
      const store = createGameStore();
      store.getState().hydrateFromLibrary(result.game.state);
      setLoad({ status: "ready", entry: result.game.entry, store });
    });
    return () => {
      current = false;
    };
  }, [id, attempt]);

  const back = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const remove = async () => {
    if (load.status !== "ready") return;
    setDeleting(true);
    const deleted = await deleteSavedGame(load.entry);
    setDeleting(false);
    if (deleted) back();
  };

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top", "left", "right"]}>
      <ScreenHeader
        title={
          load.status === "ready"
            ? `${load.entry.homeTeamName} vs ${load.entry.awayTeamName}`
            : "Game"
        }
        right={
          <Button
            label="Delete"
            accessibilityLabel="Delete game"
            size="sm"
            variant="ghost"
            disabled={load.status !== "ready" || deleting}
            onPress={remove}
          />
        }
      />
      {load.status === "loading" ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator accessibilityLabel="Loading the game" color="#737373" />
        </View>
      ) : load.status === "failed" ? (
        <View className="flex-1 items-center justify-center gap-4 p-6">
          <Text className="text-center text-danger">{load.message}</Text>
          <Button
            label="Try again"
            onPress={() => {
              setLoad({ status: "loading" });
              setAttempt((n) => n + 1);
            }}
          />
        </View>
      ) : (
        <GameStoreProvider store={load.store}>
          <Tabs tabs={TABS} value={tab} onChange={setTab} />
          <ScrollView contentContainerClassName="w-full max-w-6xl gap-4 self-center p-4 pb-12 md:p-6">
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Back to your library"
              onPress={back}
              hitSlop={8}
              className="self-start"
            >
              <Text className="text-xs text-ink-dim">‹ Back to your library</Text>
            </Pressable>
            <FinalScore />
            {tab === "stats" ? (
              <>
                <BoxScore side="home" />
                <BoxScore side="away" />
              </>
            ) : null}
            {tab === "scoresheet" ? <Scoresheet /> : null}
            {tab === "plays" ? <GameLog /> : null}
          </ScrollView>
        </GameStoreProvider>
      )}
    </SafeAreaView>
  );
}

/** The two teams and their scores, and whether the game is final. */
function FinalScore() {
  const homeTeam = useGame((s) => s.homeTeam);
  const awayTeam = useGame((s) => s.awayTeam);
  const finished = useGame((s) => s.status === "finished");
  const stats = useGameStats();

  return (
    <View
      accessible
      accessibilityLabel={`${finished ? "Final" : "In progress"}: ${homeTeam.name} ${stats.home.points}, ${awayTeam.name} ${stats.away.points}`}
      className="flex-row items-center rounded-xl border border-surface-border bg-surface-elevated px-6 py-4"
    >
      <Text className="flex-1 text-lg font-bold text-ink" numberOfLines={1}>
        {homeTeam.name}
      </Text>
      <View className="items-center px-4">
        <Text className="text-xs uppercase tracking-widest text-ink-muted">
          {finished ? "Final" : "In progress"}
        </Text>
        <Text className="text-4xl font-bold text-ink" style={TABULAR}>
          {stats.home.points} – {stats.away.points}
        </Text>
      </View>
      <Text className="flex-1 text-right text-lg font-bold text-ink" numberOfLines={1}>
        {awayTeam.name}
      </Text>
    </View>
  );
}
