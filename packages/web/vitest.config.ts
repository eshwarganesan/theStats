import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // The `server-only` package throws when imported from a browser
      // bundle. Vitest's jsdom env triggers that throw, blocking
      // integration tests that import server-side route handlers. Point
      // the alias at a no-op shim for tests only; Next.js's bundler
      // resolves the real package in production builds.
      "server-only": path.resolve(__dirname, "./src/test/server-only-shim.ts"),
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./vitest.setup.ts"],
    css: false,
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      // Integration tests (Route Handlers, SQL math) live under tests/
      // because they're full-stack. They self-skip via `describe.skipIf`
      // when Supabase env vars are missing, so they're discovery-safe.
      "tests/integration/**/*.test.ts",
    ],
    exclude: ["node_modules", ".next", "tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.spec.{ts,tsx}",
        "src/test/**",
        // Page components are exercised by Playwright (tests/e2e/*).
        "src/app/**",
        "src/**/*.d.ts",
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
        "src/lib/**": {
          lines: 100,
          functions: 100,
          branches: 100,
          statements: 100,
        },
        // src/lib/supabase/* are thin wrappers around @supabase/* clients
        // whose internals we don't own; covering them at 100% would
        // require mocking next/headers and @supabase/ssr internals
        // without meaningful safety upside. Held to the global 90% bar.
        "src/lib/supabase/**": {
          lines: 90,
          functions: 90,
          branches: 90,
          statements: 90,
        },
      },
    },
  },
});
