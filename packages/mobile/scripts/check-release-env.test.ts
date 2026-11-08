/// <reference types="node" />
import { spawnSync } from "node:child_process";
import path from "node:path";

const SCRIPT = path.join(__dirname, "check-release-env.mjs");

const VALID = {
  EXPO_PUBLIC_API_URL: "https://thestats.example.com",
  EXPO_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
};

function run(env: Record<string, string>) {
  const result = spawnSync(process.execPath, [SCRIPT], {
    // Nothing inherited, so the variables under test come from `env` alone.
    env: { NODE_ENV: "test", ...env },
    encoding: "utf8",
  });
  return { status: result.status, out: result.stdout, err: result.stderr };
}

describe("check-release-env", () => {
  it("passes with all three values, naming the API it will call", () => {
    const { status, out } = run(VALID);
    expect(status).toBe(0);
    expect(out).toContain("https://thestats.example.com");
  });

  it("fails, listing every missing value", () => {
    const { status, err } = run({ EXPO_PUBLIC_SUPABASE_URL: "https://abc.supabase.co" });
    expect(status).toBe(1);
    expect(err).toContain("EXPO_PUBLIC_API_URL is not set");
    expect(err).toContain("EXPO_PUBLIC_SUPABASE_ANON_KEY is not set");
    expect(err).not.toContain("EXPO_PUBLIC_SUPABASE_URL is not set");
  });

  it("fails on a blank value", () => {
    const { status, err } = run({ ...VALID, EXPO_PUBLIC_SUPABASE_ANON_KEY: "  " });
    expect(status).toBe(1);
    expect(err).toContain("EXPO_PUBLIC_SUPABASE_ANON_KEY is not set");
  });

  it.each(["http://10.0.0.129:3000", "thestats.example.com", "https://"])(
    "fails when the API URL isn't https: %s",
    (url) => {
      const { status, err } = run({ ...VALID, EXPO_PUBLIC_API_URL: url });
      expect(status).toBe(1);
      expect(err).toContain("EXPO_PUBLIC_API_URL must be an https:// URL");
    },
  );
});
