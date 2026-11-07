import { apiFetch } from "@/lib/api";

import { deleteGame, getGame, listGames } from "./games";

jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
const apiFetchMock = jest.mocked(apiFetch);

const entry = {
  id: "g1",
  status: "in-progress",
  homeTeamName: "Central",
  awayTeamName: "Eastridge",
  homeScore: 10,
  awayScore: 8,
  eventCount: 12,
  currentPeriod: 2,
  startedAt: "2026-10-01T18:00:00Z",
  lastActivityAt: "2026-10-01T18:40:00Z",
  finishedAt: null,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => apiFetchMock.mockReset());

describe("listGames", () => {
  it("returns the validated first page", async () => {
    apiFetchMock.mockResolvedValueOnce(json(200, { entries: [entry], nextCursor: "c1" }));

    expect(await listGames()).toEqual({ ok: true, page: { entries: [entry], nextCursor: "c1" } });
    expect(apiFetchMock).toHaveBeenCalledWith("/api/games");
  });

  it("asks for the page after a cursor", async () => {
    apiFetchMock.mockResolvedValueOnce(json(200, { entries: [], nextCursor: null }));

    await listGames("2026-10-01T18:40:00.000+00:00");

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/games?cursor=2026-10-01T18%3A40%3A00.000%2B00%3A00",
    );
  });

  it("reports a network failure", async () => {
    apiFetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));
    expect(await listGames()).toEqual({
      ok: false,
      message: "Can't reach theStats. Check your connection and try again.",
    });
  });

  it.each([
    ["an error status", () => json(500, { error: { code: "internal_error" } })],
    ["an unreadable body", () => new Response("<html>", { status: 200 })],
    ["a body that doesn't match the contract", () => json(200, { entries: [{ id: 1 }] })],
  ])("reports %s as a load failure", async (_label, response) => {
    apiFetchMock.mockResolvedValueOnce(response());
    expect(await listGames()).toEqual({
      ok: false,
      message: "Couldn't load your games. Please try again.",
    });
  });
});

const state = {
  schemaVersion: 1,
  homeTeam: { id: "h", name: "Central", tag: "CEN", color: "#3B82F6", coach: "", roster: [] },
  awayTeam: { id: "a", name: "Eastridge", tag: "EST", color: "#EF4444", coach: "", roster: [] },
  settings: { format: "5v5", periods: 4, periodSeconds: 600 },
  status: "finished",
  currentPeriod: 4,
  events: [],
  possession: null,
  onCourt: { home: [], away: [] },
};

describe("getGame", () => {
  it("returns the game's summary and state", async () => {
    apiFetchMock.mockResolvedValueOnce(json(200, { game: { ...entry, ownerId: "u1", state } }));

    const result = await getGame("g 1");

    expect(apiFetchMock).toHaveBeenCalledWith("/api/games/g%201");
    expect(result).toEqual({ ok: true, game: { entry, state } });
  });

  it("says when the game is gone", async () => {
    apiFetchMock.mockResolvedValueOnce(json(404, { error: { code: "not_found" } }));
    expect(await getGame("g1")).toEqual({
      ok: false,
      message: "That game isn't in your library any more.",
    });
  });

  it("reports a network failure", async () => {
    apiFetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));
    expect(await getGame("g1")).toMatchObject({ ok: false, message: expect.stringMatching(/^Can't reach/) });
  });

  it.each([
    ["an error status", () => json(500, {})],
    ["an unreadable body", () => new Response("<html>", { status: 200 })],
    ["a body without a game", () => json(200, { entries: [] })],
    ["a game with a broken summary", () => json(200, { game: { ...entry, id: 7, state } })],
    ["a game with a broken state", () => json(200, { game: { ...entry, state: { schemaVersion: 2 } } })],
  ])("reports %s as a load failure", async (_label, response) => {
    apiFetchMock.mockResolvedValueOnce(response());
    expect(await getGame("g1")).toEqual({
      ok: false,
      message: "Couldn't load the game. Please try again.",
    });
  });
});

describe("deleteGame", () => {
  it("deletes the game, and treats one that's already gone as deleted", async () => {
    apiFetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await deleteGame("g1")).toEqual({ ok: true });
    expect(apiFetchMock).toHaveBeenCalledWith("/api/games/g1", { method: "DELETE" });

    apiFetchMock.mockResolvedValueOnce(json(404, {}));
    expect(await deleteGame("g1")).toEqual({ ok: true });
  });

  it("reports failures", async () => {
    apiFetchMock.mockResolvedValueOnce(json(500, {}));
    expect(await deleteGame("g1")).toEqual({
      ok: false,
      message: "Couldn't delete the game. Please try again.",
    });
    apiFetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));
    expect(await deleteGame("g1")).toMatchObject({ ok: false, message: expect.stringMatching(/^Can't reach/) });
  });
});
