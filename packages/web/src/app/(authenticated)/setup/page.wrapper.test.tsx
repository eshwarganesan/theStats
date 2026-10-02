/**
 * Server-Component wrapper tests for /setup, /game, /game/stats,
 * /game/scoresheet — belt-and-suspenders alongside middleware (see the
 * notes atop each `page.tsx`). Each wrapper redirects a signed-out
 * caller to `/login?from=<its own path>` before any client code mounts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUserMock, redirectMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  redirectMock: vi.fn((url: string): never => {
    throw new Error(`__REDIRECT__${url}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({
    auth: { getUser: getUserMock },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
}));

// Mock the four client bodies so we don't drag in Zustand / rAF /
// anything else that lives on the client. Each returns a sentinel we
// can assert on.
vi.mock("./SetupPageClient", () => ({
  default: () => <div data-testid="setup-client" />,
}));
vi.mock("../game/LiveGamePageClient", () => ({
  default: () => <div data-testid="game-client" />,
}));
vi.mock("../game/stats/StatsPageClient", () => ({
  default: () => <div data-testid="stats-client" />,
}));
vi.mock("../game/scoresheet/ScoresheetPageClient", () => ({
  default: () => <div data-testid="scoresheet-client" />,
}));

import { render } from "@testing-library/react";
import SetupPage from "./page";
import LiveGamePage from "../game/page";
import StatsPage from "../game/stats/page";
import ScoresheetPage from "../game/scoresheet/page";

function stubAuthed() {
  getUserMock.mockResolvedValue({
    data: { user: { id: "u1", email: "u@example.com" } },
    error: null,
  });
}

function stubUnauthed() {
  getUserMock.mockResolvedValue({
    data: { user: null },
    error: null,
  });
}

beforeEach(() => {
  getUserMock.mockReset();
  redirectMock.mockClear();
});

interface Case {
  name: string;
  path: string;
  encoded: string;
  wrapper: () => Promise<React.ReactElement>;
  clientTestId: string;
}

const CASES: Case[] = [
  {
    name: "SetupPage",
    path: "/setup",
    encoded: "%2Fsetup",
    wrapper: SetupPage,
    clientTestId: "setup-client",
  },
  {
    name: "LiveGamePage",
    path: "/game",
    encoded: "%2Fgame",
    wrapper: LiveGamePage,
    clientTestId: "game-client",
  },
  {
    name: "StatsPage",
    path: "/game/stats",
    encoded: "%2Fgame%2Fstats",
    wrapper: StatsPage,
    clientTestId: "stats-client",
  },
  {
    name: "ScoresheetPage",
    path: "/game/scoresheet",
    encoded: "%2Fgame%2Fscoresheet",
    wrapper: ScoresheetPage,
    clientTestId: "scoresheet-client",
  },
];

describe.each(CASES)(
  "$name — Server Component auth wrapper",
  ({ path, encoded, wrapper, clientTestId }) => {
    it(`redirects a signed-out caller to /login?from=${encoded}`, async () => {
      stubUnauthed();
      await expect(wrapper()).rejects.toThrow(`__REDIRECT__/login?from=${encoded}`);
      expect(redirectMock).toHaveBeenCalledWith(`/login?from=${encoded}`);
    });

    it(`renders its client body when authenticated (path: ${path})`, async () => {
      stubAuthed();
      const jsx = await wrapper();
      const { getByTestId } = render(jsx);
      expect(getByTestId(clientTestId)).toBeInTheDocument();
      expect(redirectMock).not.toHaveBeenCalled();
    });
  },
);
