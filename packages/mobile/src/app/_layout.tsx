import "../global.css";

import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { SessionProvider, useSession } from "@/lib/session";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="light" />
      <RootStack />
    </SessionProvider>
  );
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
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "#0B0B0D" },
      }}
    >
      <Stack.Protected guard={session !== null}>
        <Stack.Screen name="index" />
      </Stack.Protected>
      <Stack.Protected guard={session === null}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}
