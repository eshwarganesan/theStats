import { apiFetch } from "@/lib/api";

import { listGames } from "./games";

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
