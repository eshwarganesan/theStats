/**
 * Zod-validated process.env for theStats's `packages/web`.
 *
 * Per Constitution Principle V ("Secrets, credentials, and tokens MUST NEVER
 * be committed. Configuration MUST be read from environment variables and
 * validated at startup") and Principle VI ("server-only secrets"), env is
 * split into two surfaces:
 *
 *   - `getPublicEnv()` — `NEXT_PUBLIC_*` only. Safe to call from anywhere
 *                        (browser, server, edge). Inlined by Next at build.
 *   - `getServerEnv()` — full env, including `SUPABASE_SERVICE_ROLE_KEY`.
 *                        MUST only be called from server-only modules; the
 *                        client bundle will not have the service-role key
 *                        and the call will throw.
 *
 * Both getters lazily parse `process.env` on first call so callers fail at
 * runtime entry into auth code, not at unrelated import sites.
 *
 * The exported `parseEnv` / `parsePublicEnv` pure functions exist for unit
 * testing; the getters wrap them around `process.env`.
 */
import { z } from "zod";

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serverSchema = publicSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

export function parseEnv(raw: Record<string, string | undefined>): ServerEnv {
  const parsed = serverSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid env: ${formatIssues(parsed.error)}`);
  }
  return parsed.data;
}

export function parsePublicEnv(raw: Record<string, string | undefined>): PublicEnv {
  const parsed = publicSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid env: ${formatIssues(parsed.error)}`);
  }
  return parsed.data;
}

let _serverEnv: ServerEnv | undefined;
let _publicEnv: PublicEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (!_serverEnv) {
    _serverEnv = parseEnv(process.env as Record<string, string | undefined>);
  }
  return _serverEnv;
}

export function getPublicEnv(): PublicEnv {
  if (!_publicEnv) {
    _publicEnv = parsePublicEnv(process.env as Record<string, string | undefined>);
  }
  return _publicEnv;
}
