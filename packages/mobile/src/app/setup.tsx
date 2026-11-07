import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ScreenHeader } from "@/components/ScreenHeader";
import { GameSettingsForm } from "@/components/setup/GameSettingsForm";
import { TeamSetupCard } from "@/components/setup/TeamSetupCard";
import { Button } from "@/components/ui/Button";
import { useGameStore } from "@/lib/store";

/**
 * Game setup: settings and both rosters. "Continue to game" runs the
 * store's checks (enough players, the right number of starters, unique
 * jersey numbers) and opens the live console.
 */
export default function SetupScreen() {
  const router = useRouter();
  const status = useGameStore((s) => s.status);
  const prepareGame = useGameStore((s) => s.prepareGame);
  const resetAll = useGameStore((s) => s.resetAll);
  const [error, setError] = useState<string | null>(null);

  // Once a game has tipped off, setting it up again would wipe its plays.
  if (status !== "setup" && status !== "ready") return <Redirect href="/game" />;

  const onContinue = () => {
    const result = prepareGame();
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setError(null);
    router.replace("/game");
  };

  const continueButton = (size: "md" | "lg") => (
    <Button label="Continue to game" variant="primary" size={size} onPress={onContinue} />
  );

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={["top", "left", "right"]}>
      <ScreenHeader
        title="Game setup"
        onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        right={
          <>
            <Button label="Reset" variant="ghost" size="sm" onPress={resetAll} />
            {continueButton("md")}
          </>
        }
      />
      <KeyboardAvoidingView className="flex-1" behavior="padding">
        <ScrollView
          contentContainerClassName="w-full max-w-6xl gap-6 self-center p-4 pb-12 md:p-6"
          keyboardShouldPersistTaps="handled"
        >
          <GameSettingsForm />
          <View className="gap-6 lg:flex-row">
            <TeamSetupCard side="home" />
            <TeamSetupCard side="away" />
          </View>
          {error ? (
            <Text
              accessibilityRole="alert"
              className="rounded-lg border border-danger bg-danger/10 px-4 py-3 text-sm text-danger"
            >
              {error}
            </Text>
          ) : null}
          <View className="items-end">{continueButton("lg")}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
