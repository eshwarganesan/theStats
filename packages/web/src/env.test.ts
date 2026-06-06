import { describe, it, expect } from "vitest";
import { parseEnv } from "./env";

const COMPLETE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
} as const;

describe("parseEnv", () => {
  it("returns a frozen, fully-typed env when every required var is present", () => {
    const env = parseEnv(COMPLETE_ENV);
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54321");
    expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe("anon-key");
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe("service-role-key");
  });

  it("throws when SUPABASE_SERVICE_ROLE_KEY is missing", () => {
    const incomplete = {
      NEXT_PUBLIC_SUPABASE_URL: COMPLETE_ENV.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: COMPLETE_ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    };
    expect(() => parseEnv(incomplete)).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("throws when NEXT_PUBLIC_SUPABASE_URL is not a URL", () => {
    expect(() =>
      parseEnv({ ...COMPLETE_ENV, NEXT_PUBLIC_SUPABASE_URL: "not-a-url" }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("throws when an env value is an empty string", () => {
    expect(() =>
      parseEnv({ ...COMPLETE_ENV, NEXT_PUBLIC_SUPABASE_ANON_KEY: "" }),
    ).toThrow(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  });
});
