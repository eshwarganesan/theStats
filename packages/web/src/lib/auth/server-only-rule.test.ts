/**
 * Defends Constitution Principle VI's "server-only secrets" invariant via
 * a real ESLint pass over an in-memory fixture, using the project's
 * actual `eslint.config.mjs`.
 *
 * Two assertions:
 *   - A non-exempt file that touches `env.SUPABASE_SERVICE_ROLE_KEY` MUST
 *     trigger the no-restricted-syntax rule (i.e. the safety net works).
 *   - The same code in `src/lib/supabase/admin.ts` MUST NOT trigger it
 *     (i.e. the legitimate access point isn't punished).
 */
import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";

const VIOLATION_CODE = `
function leak(env: { SUPABASE_SERVICE_ROLE_KEY: string }): string {
  return env.SUPABASE_SERVICE_ROLE_KEY;
}
leak({ SUPABASE_SERVICE_ROLE_KEY: "x" });
`;

async function lintAs(filePath: string): Promise<ESLint.LintResult[]> {
  const eslint = new ESLint();
  return eslint.lintText(VIOLATION_CODE, { filePath });
}

function hasServerOnlyViolation(results: ESLint.LintResult[]): boolean {
  for (const r of results) {
    for (const m of r.messages) {
      if (
        m.ruleId === "no-restricted-syntax" &&
        m.message.includes("SUPABASE_SERVICE_ROLE_KEY")
      ) {
        return true;
      }
    }
  }
  return false;
}

describe("ESLint: SUPABASE_SERVICE_ROLE_KEY server-only rule", () => {
  it(
    "flags access from a non-exempt file (e.g. a Client Component)",
    { timeout: 30000 },
    async () => {
      const results = await lintAs("src/components/auth/leak.tsx");
      expect(hasServerOnlyViolation(results)).toBe(true);
    },
  );

  it(
    "allows access from src/lib/supabase/admin.ts",
    { timeout: 30000 },
    async () => {
      const results = await lintAs("src/lib/supabase/admin.ts");
      expect(hasServerOnlyViolation(results)).toBe(false);
    },
  );
});
