import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { computeStats, type GameStatus } from "@thestats/core";

import { signOut } from "@/lib/auth";
import { useSession } from "@/lib/session";
import { useGameStore } from "@/lib/store";

const STATUS_LABELS: Record<GameStatus, string> = {
  setup: "Not started",
  ready: "Ready to tip off",
  live: "Live",
  timeout: "Timeout",
  "period-break": "Period break",
  finished: "Final",
};

/**
 * Placeholder home screen. Proves the shared store, persistence, and
 * stats pipeline run on iOS; the real setup / scoreboard / library
 * screens replace it in later migration steps.
 */
export default function HomeScreen() {
  const { session } = useSession();
  const homeTeam = useGameStore((s) => s.homeTeam);
  const awayTeam = useGameStore((s) => s.awayTeam);
  const settings = useGameStore((s) => s.settings);
  const events = useGameStore((s) => s.events);
  const status = useGameStore((s) => s.status);
  const currentPeriod = useGameStore((s) => s.currentPeriod);

  const stats = useMemo(
    () => computeStats(events, homeTeam, awayTeam, settings, currentPeriod),
    [events, homeTeam, awayTeam, settings, currentPeriod],
  );

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <View className="flex-row items-center justify-end gap-4 px-6 pt-2">
        <Text className="text-sm text-ink-muted" numberOfLines={1}>
          {session?.user.email}
        </Text>
        <SignOutButton />
      </View>
      <View className="flex-1 items-center justify-center gap-8 px-6">
        <Text className="text-4xl font-bold text-ink md:text-6xl">
          theStats
        </Text>

        <View className="w-full max-w-xl rounded-xl border border-surface-border bg-surface-elevated p-6">
          <Text className="mb-4 text-center text-sm uppercase tracking-widest text-ink-muted">
            {STATUS_LABELS[status]}
          </Text>
          <View className="flex-row items-center justify-between">
            <TeamScore name={homeTeam.name} points={stats.home.points} accent="text-home" />
            <Text className="text-2xl text-ink-dim">vs</Text>
            <TeamScore name={awayTeam.name} points={stats.away.points} accent="text-away" />
          </View>
        </View>

        <Text className="text-center text-ink-dim">
          iPad & iPhone app — scoring screens coming next.
        </Text>
      </View>
    </SafeAreaView>
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

function SignOutButton() {
  const [pending, setPending] = useState(false);

  async function onPress() {
    setPending(true);
    try {
      await signOut();
    } finally {
      setPending(false);
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Sign out"
      disabled={pending}
      onPress={onPress}
      className="disabled:opacity-50"
    >
      <Text className="text-sm uppercase tracking-wider text-ink-dim">Sign out</Text>
    </Pressable>
  );
}
