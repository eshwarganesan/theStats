/**
 * Public config for the iOS app, read from `EXPO_PUBLIC_*` variables.
 *
 * Expo inlines these at bundle time, and only for literal
 * `process.env.EXPO_PUBLIC_X` accesses, so `getEnv` names each one
 * explicitly. Nothing here is secret: the anon key is gated by RLS, the
 * same as on web. Copy `.env.example` to `.env.local` to set them.
 */
export interface MobileEnv {
  /** Supabase project URL (same value as web's NEXT_PUBLIC_SUPABASE_URL). */
  supabaseUrl: string;
  /** Supabase anon key (same value as web's NEXT_PUBLIC_SUPABASE_ANON_KEY). */
  supabaseAnonKey: string;
  /** Origin of the theStats web app, which serves /api/*. No trailing slash. */
  apiUrl: string;
}

const NAMES = {
  supabaseUrl: "EXPO_PUBLIC_SUPABASE_URL",
  supabaseAnonKey: "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  apiUrl: "EXPO_PUBLIC_API_URL",
} as const satisfies Record<keyof MobileEnv, string>;

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/[^\s/]+/.test(value);
}

export function parseEnv(raw: Record<string, string | undefined>): MobileEnv {
  const problems: string[] = [];
  const read = (key: keyof MobileEnv, url: boolean): string => {
    const name = NAMES[key];
    const value = (raw[name] ?? "").trim();
    if (!value) problems.push(`${name} is not set`);
    else if (url && !isHttpUrl(value)) problems.push(`${name} must be an http(s) URL`);
    return value;
  };

  const env: MobileEnv = {
    supabaseUrl: read("supabaseUrl", true),
    supabaseAnonKey: read("supabaseAnonKey", false),
    apiUrl: read("apiUrl", true).replace(/\/+$/, ""),
  };
  if (problems.length > 0) {
    throw new Error(
      `Invalid env: ${problems.join("; ")}. Copy packages/mobile/.env.example to .env.local.`,
    );
  }
  return env;
}

let cached: MobileEnv | undefined;

export function getEnv(): MobileEnv {
  cached ??= parseEnv({
    EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
  });
  return cached;
}
