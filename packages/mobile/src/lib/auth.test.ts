import { signIn, signOut } from "./auth";

const mockSetSession = jest.fn();
const mockSignOut = jest.fn();

jest.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ auth: { setSession: mockSetSession, signOut: mockSignOut } }),
}));
jest.mock("@/env", () => ({ getEnv: () => ({ apiUrl: "http://api.test" }) }));

const fetchMock = jest.fn();
globalThis.fetch = fetchMock;

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSetSession.mockResolvedValue({ error: null });
  mockSignOut.mockResolvedValue({ error: null });
});

describe("signIn", () => {
  it("posts credentials to /api/auth/token and stores the returned session", async () => {
    respond(200, { access_token: "a", refresh_token: "r", expires_at: 1 });
    expect(await signIn("coach@example.com", "pw")).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("http://api.test/api/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: "coach@example.com", password: "pw" }),
    });
    expect(mockSetSession).toHaveBeenCalledWith({ access_token: "a", refresh_token: "r" });
  });

  it("passes through known API errors, including retry-after", async () => {
    respond(429, {
      error: { code: "rate_limited", message: "Too many", retry_after_seconds: 7 },
    });
    expect(await signIn("a@b.co", "pw")).toEqual({
      ok: false,
      code: "rate_limited",
      message: "Too many",
      retryAfterSeconds: 7,
    });

    respond(401, { error: { code: "invalid_credentials", message: "Invalid email or password." } });
    expect(await signIn("a@b.co", "pw")).toEqual({
      ok: false,
      code: "invalid_credentials",
      message: "Invalid email or password.",
    });
  });

  it.each([
    ["an unknown code", { error: { code: "teapot", message: "x" } }],
    ["a missing message", { error: { code: "invalid_input" } }],
    ["no error object", { nope: true }],
    ["a non-object body", "oops"],
  ])("maps %s to a generic error", async (_label, body) => {
    respond(500, body);
    expect(await signIn("a@b.co", "pw")).toMatchObject({ ok: false, code: "internal_error" });
  });

  it("reports a network failure", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));
    expect(await signIn("a@b.co", "pw")).toMatchObject({ ok: false, code: "network_error" });
  });

  it("reports an unreadable body", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new SyntaxError("bad json");
      },
    });
    expect(await signIn("a@b.co", "pw")).toMatchObject({ code: "internal_error" });
  });

  it("rejects a 200 without tokens", async () => {
    respond(200, { access_token: "a" });
    expect(await signIn("a@b.co", "pw")).toMatchObject({ code: "internal_error" });
    respond(200, null);
    expect(await signIn("a@b.co", "pw")).toMatchObject({ code: "internal_error" });
    expect(mockSetSession).not.toHaveBeenCalled();
  });

  it("fails if supabase-js rejects the session", async () => {
    respond(200, { access_token: "a", refresh_token: "r" });
    mockSetSession.mockResolvedValueOnce({ error: new Error("bad jwt") });
    expect(await signIn("a@b.co", "pw")).toMatchObject({ code: "internal_error" });
  });
});

describe("signOut", () => {
  it("revokes the session server-side", async () => {
    await signOut();
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledWith();
  });

  it("falls back to a local sign-out when the server call fails", async () => {
    mockSignOut.mockResolvedValueOnce({ error: new Error("offline") });
    await signOut();
    expect(mockSignOut).toHaveBeenLastCalledWith({ scope: "local" });
  });
});
