import { apiFetch } from "./api";

const mockGetSession = jest.fn();
const mockRefreshSession = jest.fn();

jest.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: { getSession: mockGetSession, refreshSession: mockRefreshSession },
  }),
}));
jest.mock("@/env", () => ({ getEnv: () => ({ apiUrl: "http://api.test" }) }));

const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();
globalThis.fetch = fetchMock as unknown as typeof fetch;

const session = (token: string) => ({ data: { session: { access_token: token } }, error: null });
const sentAuth = (n: number) => new Headers(fetchMock.mock.calls[n]?.[1].headers).get("Authorization");

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(session("token-1"));
});

describe("apiFetch", () => {
  it("sends the session's access token to the API origin", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const res = await apiFetch("/api/games?limit=5", {
      method: "PATCH",
      headers: { "Idempotency-Key": "k1" },
      body: "{}",
    });

    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://api.test/api/games?limit=5");
    expect(init).toMatchObject({ method: "PATCH", body: "{}" });
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer token-1");
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("Idempotency-Key")).toBe("k1");
  });

  it("keeps a caller's Accept header", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await apiFetch("/api/x", { headers: { Accept: "text/plain" } });
    expect(new Headers(fetchMock.mock.calls[0]?.[1].headers).get("Accept")).toBe("text/plain");
  });

  it("refreshes the session once and retries after a 401", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    mockRefreshSession.mockResolvedValueOnce(session("token-2"));

    const res = await apiFetch("/api/games");

    expect(res.status).toBe(200);
    expect([sentAuth(0), sentAuth(1)]).toEqual(["Bearer token-1", "Bearer token-2"]);
  });

  it("returns the 401 when the session can't be refreshed", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    for (const refreshed of [
      { data: { session: null }, error: new Error("Invalid Refresh Token") },
      session("token-1"),
    ]) {
      fetchMock.mockClear();
      mockRefreshSession.mockResolvedValueOnce(refreshed);

      expect((await apiFetch("/api/games")).status).toBe(401);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("answers 401 without calling the API when signed out", async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });

    const res = await apiFetch("/api/games");

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: "unauthenticated", message: "Sign in to continue." },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
