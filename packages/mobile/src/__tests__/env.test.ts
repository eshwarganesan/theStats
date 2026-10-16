import { getEnv, parseEnv } from "@/env";

const valid = {
  EXPO_PUBLIC_SUPABASE_URL: "https://abc.supabase.co",
  EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon",
  EXPO_PUBLIC_API_URL: "http://10.0.0.128:3000/",
};

describe("parseEnv", () => {
  it("returns the config and strips trailing slashes from the API URL", () => {
    expect(parseEnv(valid)).toEqual({
      supabaseUrl: "https://abc.supabase.co",
      supabaseAnonKey: "anon",
      apiUrl: "http://10.0.0.128:3000",
    });
  });

  it("lists every missing or malformed variable", () => {
    expect(() =>
      parseEnv({ EXPO_PUBLIC_SUPABASE_URL: "abc.supabase.co", EXPO_PUBLIC_API_URL: " " }),
    ).toThrow(
      "Invalid env: EXPO_PUBLIC_SUPABASE_URL must be an http(s) URL; " +
        "EXPO_PUBLIC_SUPABASE_ANON_KEY is not set; EXPO_PUBLIC_API_URL is not set.",
    );
  });
});

describe("getEnv", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("reads EXPO_PUBLIC_* once and caches the result", () => {
    Object.assign(process.env, valid);
    const first = getEnv();
    expect(first.apiUrl).toBe("http://10.0.0.128:3000");
    process.env.EXPO_PUBLIC_API_URL = "https://changed.example";
    expect(getEnv()).toBe(first);
  });
});
