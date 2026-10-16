import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

import { secureSessionStorage } from "./secureSessionStorage";
import { bindAutoRefreshToAppState, getSupabase } from "./supabase";

jest.mock("react-native-url-polyfill/auto", () => ({}));
jest.mock("@supabase/supabase-js", () => ({ createClient: jest.fn(() => ({ __mock: true })) }));
jest.mock("@/lib/secureSessionStorage", () => ({ secureSessionStorage: { __storage: true } }));
jest.mock("@/env", () => ({
  getEnv: () => ({
    supabaseUrl: "https://abc.supabase.co",
    supabaseAnonKey: "anon",
    apiUrl: "http://api",
  }),
}));

describe("getSupabase", () => {
  it("creates one keychain-backed client and reuses it", () => {
    const client = getSupabase();
    expect(getSupabase()).toBe(client);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith("https://abc.supabase.co", "anon", {
      auth: {
        storage: secureSessionStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  });
});

describe("bindAutoRefreshToAppState", () => {
  it("refreshes only while the app is active", () => {
    const remove = jest.fn();
    let listener: ((s: string) => void) | undefined;
    jest.spyOn(AppState, "addEventListener").mockImplementation((_type, cb) => {
      listener = cb as (s: string) => void;
      return { remove } as unknown as ReturnType<typeof AppState.addEventListener>;
    });
    Object.defineProperty(AppState, "currentState", { value: "active", configurable: true });

    const auth = { startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn() };
    const unbind = bindAutoRefreshToAppState({ auth } as unknown as Parameters<
      typeof bindAutoRefreshToAppState
    >[0]);
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(1);

    listener?.("background");
    expect(auth.stopAutoRefresh).toHaveBeenCalledTimes(1);
    listener?.("active");
    expect(auth.startAutoRefresh).toHaveBeenCalledTimes(2);

    unbind();
    expect(remove).toHaveBeenCalled();
  });
});
