/**
 * Middleware routing-decision tests (feature 011-auth-gated-landing).
 *
 * The wrapper in `middleware.ts` is a thin adapter around `decideRoute()`
 * that handles cookie-rotation plumbing (feature 005) and constructs the
 * `NextResponse`. We unit-test the pure routing function here so we can
 * exercise every row of the 17-row response matrix
 * (`specs/011-auth-gated-landing/contracts/middleware.md`) without
 * fighting Next.js's Edge runtime primitives in JSDOM.
 */
import { describe, it, expect } from "vitest";
import type { User } from "@supabase/supabase-js";
import { decideRoute } from "./middleware";

const authed: User = {
  id: "user-1",
  email: "u@example.com",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: new Date().toISOString(),
} as unknown as User;

describe("decideRoute — authenticated user on public entry points", () => {
  it("redirects / to /games (contract row 2)", () => {
    expect(decideRoute("/", "", authed)).toEqual({
      kind: "redirect",
      location: "/games",
    });
  });

  it("redirects /login to /games (contract row 4)", () => {
    expect(decideRoute("/login", "", authed)).toEqual({
      kind: "redirect",
      location: "/games",
    });
  });

  it("redirects /login?from=/games to /games (query on /login does not matter)", () => {
    expect(decideRoute("/login", "?from=/games", authed)).toEqual({
      kind: "redirect",
      location: "/games",
    });
  });

  it("passes through /games for an authenticated user", () => {
    expect(decideRoute("/games", "", authed)).toEqual({ kind: "next" });
  });

  it("passes through /setup for an authenticated user", () => {
    expect(decideRoute("/setup", "", authed)).toEqual({ kind: "next" });
  });

  it("passes through /game/stats for an authenticated user", () => {
    expect(decideRoute("/game/stats", "", authed)).toEqual({ kind: "next" });
  });

  it("passes through /account for an authenticated user", () => {
    expect(decideRoute("/account", "", authed)).toEqual({ kind: "next" });
  });
});

describe("decideRoute — unauthenticated user on public routes", () => {
  it("passes through / (public landing)", () => {
    expect(decideRoute("/", "", null)).toEqual({ kind: "next" });
  });

  it("passes through /login", () => {
    expect(decideRoute("/login", "", null)).toEqual({ kind: "next" });
  });

  it("passes through /login?from=/games (query preserved by wrapper, decision unchanged)", () => {
    expect(decideRoute("/login", "?from=/games", null)).toEqual({
      kind: "next",
    });
  });

  it("passes through /auth/callback", () => {
    expect(decideRoute("/auth/callback", "?code=abc", null)).toEqual({
      kind: "next",
    });
  });

  it("passes through /api/games (handler enforces auth, not middleware)", () => {
    expect(decideRoute("/api/games", "", null)).toEqual({ kind: "next" });
  });

  it("passes through /api/auth/sign-in", () => {
    expect(decideRoute("/api/auth/sign-in", "", null)).toEqual({
      kind: "next",
    });
  });
});

describe("decideRoute — unauthenticated user on protected pages bounces to /login?from=<encoded>", () => {
  it("bounces /setup to /login?from=%2Fsetup", () => {
    expect(decideRoute("/setup", "", null)).toEqual({
      kind: "redirect",
      location: "/login?from=%2Fsetup",
    });
  });

  it("bounces /game to /login?from=%2Fgame", () => {
    expect(decideRoute("/game", "", null)).toEqual({
      kind: "redirect",
      location: "/login?from=%2Fgame",
    });
  });

  it("bounces /game/stats to /login?from=%2Fgame%2Fstats", () => {
    expect(decideRoute("/game/stats", "", null)).toEqual({
      kind: "redirect",
      location: "/login?from=%2Fgame%2Fstats",
    });
  });

  it("bounces /games to /login?from=%2Fgames", () => {
    expect(decideRoute("/games", "", null)).toEqual({
      kind: "redirect",
      location: "/login?from=%2Fgames",
    });
  });

  it("preserves the query string in `from` for /games/abc123?tab=history", () => {
    expect(decideRoute("/games/abc123", "?tab=history", null)).toEqual({
      kind: "redirect",
      location: "/login?from=%2Fgames%2Fabc123%3Ftab%3Dhistory",
    });
  });

  it("bounces /account to /login?from=%2Faccount", () => {
    expect(decideRoute("/account", "", null)).toEqual({
      kind: "redirect",
      location: "/login?from=%2Faccount",
    });
  });

  it("bounces /account/settings to /login?from=%2Faccount%2Fsettings", () => {
    expect(decideRoute("/account/settings", "", null)).toEqual({
      kind: "redirect",
      location: "/login?from=%2Faccount%2Fsettings",
    });
  });
});

describe("decideRoute — protection is prefix-anchored, not substring", () => {
  it("does not match /setups (would-be false-positive on prefix substring)", () => {
    expect(decideRoute("/setups", "", null)).toEqual({ kind: "next" });
  });

  it("does not match /gameboard (would-be false-positive on /game)", () => {
    expect(decideRoute("/gameboard", "", null)).toEqual({ kind: "next" });
  });
});
