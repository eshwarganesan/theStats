import { devApiUrl, getEnv, parseEnv } from "@/env";

// What `expo start` reports to Expo Go: the address it served the bundle from.
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { hostUri: "10.0.0.129:8081" } },
}));

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

  it("uses the fallback API URL when EXPO_PUBLIC_API_URL isn't set", () => {
    const env = parseEnv({ ...valid, EXPO_PUBLIC_API_URL: " " }, "http://10.0.0.129:3000");
    expect(env.apiUrl).toBe("http://10.0.0.129:3000");
  });

  it("prefers EXPO_PUBLIC_API_URL over the fallback", () => {
    expect(parseEnv(valid, "http://10.0.0.129:3000").apiUrl).toBe("http://10.0.0.128:3000");
  });
});

describe("devApiUrl", () => {
  it("points at the web dev server on the host that served the bundle", () => {
    expect(devApiUrl("10.0.0.129:8081")).toBe("http://10.0.0.129:3000");
    expect(devApiUrl("[fe80::1]:8081")).toBe("http://[fe80::1]:3000");
  });

  it("gives nothing when the bundle didn't come from `expo start`", () => {
    expect(devApiUrl(undefined)).toBeUndefined();
    expect(devApiUrl("")).toBeUndefined();
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

  it("calls the API on the Mac running `expo start` when EXPO_PUBLIC_API_URL isn't set", () => {
    Object.assign(process.env, valid, { EXPO_PUBLIC_API_URL: "" });
    // A fresh copy of the module, so the result cached above doesn't apply.
    jest.isolateModules(() => {
      const fresh = jest.requireActual<typeof import("@/env")>("@/env");
      expect(fresh.getEnv().apiUrl).toBe("http://10.0.0.129:3000");
    });
  });
});
