import "../global.css";

import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { installCryptoPolyfill } from "@/lib/cryptoPolyfill";
import { useClockCheckpoint, useGameClock } from "@/lib/gameClock";
import { useGameSync } from "@/lib/gameSync";
import { SessionProvider, useSession } from "@/lib/session";

installCryptoPolyfill(globalThis);
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="light" />
      <GameClock />
      <RootStack />
    </SessionProvider>
  );
}

/**
 * Runs the game clock for the whole app, so it keeps counting on every
 * screen, and checkpoints it so a relaunch restores it.
 */
function GameClock() {
  useGameClock();
  useClockCheckpoint();
  return null;
}

/**
 * Auth wall: signed-out users only reach `sign-in`, signed-in users
 * never see it. Expo Router redirects automatically when the session
 * flips. The splash screen stays up until the keychain has been read,
 * so a signed-in user never flashes the sign-in form on launch.
 */
function RootStack() {
  const { session, isLoading } = useSession();

  useEffect(() => {
    if (!isLoading) void SplashScreen.hideAsync();
  }, [isLoading]);

  if (isLoading) return null;

  return (
    <>
      {session ? <GameSync userId={session.user.id} /> : null}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#0B0B0D" },
        }}
      >
        <Stack.Protected guard={session !== null}>
          <Stack.Screen name="index" />
          <Stack.Screen name="setup" />
          <Stack.Screen name="game" />
          <Stack.Screen name="games/[id]" />
        </Stack.Protected>
        <Stack.Protected guard={session === null}>
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="sign-up" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

/** Saves the device's game to the signed-in user's library. */
function GameSync({ userId }: { userId: string }) {
  useGameSync(userId);
  return null;
}
