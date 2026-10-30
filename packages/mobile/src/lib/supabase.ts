import "react-native-url-polyfill/auto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState, type AppStateStatus } from "react-native";

import { getEnv } from "@/env";
import { secureSessionStorage } from "@/lib/secureSessionStorage";

/**
 * The app's single Supabase client. The session lives in the keychain
 * (see secureSessionStorage) and is refreshed automatically while the
 * app is in the foreground.
 *
 * Sign-in does not call `signInWithPassword` here: it goes through the
 * web API's POST /api/auth/token so the server-side brute-force backoff
 * applies (see lib/auth.ts). Everything after that — refresh, sign-out,
 * RLS-scoped queries — is plain supabase-js.
 */
let client: SupabaseClient | undefined;

export function getSupabase(): SupabaseClient {
  if (!client) {
    const env = getEnv();
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        storage: secureSessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/**
 * Supabase's React Native guidance: only run the refresh timer while
 * the app is active, so a backgrounded app doesn't wake up to refresh
 * and a resumed one refreshes straight away. Returns an unsubscribe.
 */
export function bindAutoRefreshToAppState(supabase: SupabaseClient): () => void {
  const apply = (state: AppStateStatus) => {
    if (state === "active") void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  };
  apply(AppState.currentState);
  const sub = AppState.addEventListener("change", apply);
  return () => sub.remove();
}
