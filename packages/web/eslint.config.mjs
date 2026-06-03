import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const compat = new FlatCompat({ baseDirectory: __dirname });

const SERVER_ONLY_MESSAGE =
  "SUPABASE_SERVICE_ROLE_KEY MUST stay server-only (Constitution Principle VI). " +
  "Access it only from src/lib/supabase/admin.ts or from integration/E2E tests; " +
  "client and edge code use the anon key + RLS instead.";

const config = [
  {
    ignores: [
      ".next/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "node_modules/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "warn",
      "react/self-closing-comp": "warn",
      // Defense-in-depth for Constitution Principle VI ("server-only secrets").
      // The `service_role` key bypasses RLS — accessing it from anywhere
      // other than the dedicated admin client is a class of mistake we want
      // ESLint to catch before code review.
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[property.name='SUPABASE_SERVICE_ROLE_KEY']",
          message: SERVER_ONLY_MESSAGE,
        },
      ],
    },
  },
  // Files that are LEGITIMATELY allowed to access the service-role key:
  //   - The dedicated admin client (the single sanctioned access point).
  //   - The env parser's unit test (verifies the key is in the parsed env).
  //   - Integration and E2E tests, which need it to seed and clean up.
  {
    files: [
      "src/lib/supabase/admin.ts",
      "src/env.test.ts",
      "tests/integration/**/*.ts",
      "tests/e2e/**/*.ts",
    ],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
];

export default config;
