import { apiFetch } from "@/lib/api";
import { beginOwnDeletion, endOwnDeletion, handleAccountGone } from "@/lib/accountGone";

import { checkAccountExists, deleteAccount } from "./account";

const mockGetSession = jest.fn();
const mockRefreshSession = jest.fn();
const order: string[] = [];

jest.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ auth: { getSession: mockGetSession, refreshSession: mockRefreshSession } }),
}));
jest.mock("@/env", () => ({ getEnv: () => ({ apiUrl: "http://api.test" }) }));
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/lib/accountGone", () => ({
  beginOwnDeletion: jest.fn(),
  endOwnDeletion: jest.fn(),
  handleAccountGone: jest.fn(),
}));

const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();
globalThis.fetch = fetchMock as unknown as typeof fetch;

const session = (token: string) => ({ data: { session: { access_token: token } }, error: null });
const envelope = (code: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ error: { code, message: "m", ...extra } });

beforeEach(() => {
  jest.clearAllMocks();
  order.length = 0;
  mockGetSession.mockResolvedValue(session("token-1"));
  jest.mocked(beginOwnDeletion).mockImplementation(() => order.push("begin"));
  jest.mocked(endOwnDeletion).mockImplementation(() => order.push("end"));
  fetchMock.mockImplementation(async () => {
    order.push("fetch");
    return new Response(null, { status: 204 });
  });
});

describe("deleteAccount", () => {
  it("reports signed-out, sending nothing, when there's no session", async () => {
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

    expect(await deleteAccount("pw")).toEqual({ kind: "signed-out" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the password with the session's token, inside the own-deletion flag", async () => {
    await deleteAccount("hunter22");

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://api.test/api/account/delete");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ password: "hunter22" }));
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer token-1");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(order).toEqual(["begin", "fetch", "end"]);
  });

  it("hands a deletion to handleAccountGone", async () => {
    expect(await deleteAccount("pw")).toEqual({ kind: "deleted" });
    expect(handleAccountGone).toHaveBeenCalledWith("deleted");
  });

  it("treats account_deleted as already deleted (a retry after a lost reply)", async () => {
    fetchMock.mockResolvedValue(new Response(envelope("account_deleted"), { status: 401 }));

    expect(await deleteAccount("pw")).toEqual({ kind: "deleted" });
    expect(handleAccountGone).toHaveBeenCalledWith("deleted");
  });

  it("returns any other outcome without signing out", async () => {
    fetchMock.mockResolvedValue(new Response(envelope("current_password_incorrect"), { status: 403 }));

    expect(await deleteAccount("pw")).toEqual({ kind: "wrong-password" });
    expect(handleAccountGone).not.toHaveBeenCalled();
    expect(order).toEqual(["begin", "end"]);
  });

  it("reports offline when the request never completes", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));

    expect(await deleteAccount("pw")).toEqual({ kind: "offline" });
    expect(endOwnDeletion).toHaveBeenCalled();
  });

  it("never goes through apiFetch's refresh-and-retry", async () => {
    fetchMock.mockResolvedValue(new Response(envelope("account_deleted"), { status: 401 }));
    await deleteAccount("pw");
    expect(apiFetch).not.toHaveBeenCalled();
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });
});

describe("checkAccountExists", () => {
  const userId = "7f9d3c2a-5b1e-4c8d-9a6f-2e4b8c1d0a3f";

  it("asks the status endpoint, without the session's token", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ exists: false }), { status: 200 }));

    expect(await checkAccountExists(userId)).toBe(false);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`http://api.test/api/account/status?userId=${userId}`);
    expect(new Headers(init?.headers).get("Authorization")).toBeNull();
  });

  it("is true while the account exists", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ exists: true }), { status: 200 }));
    expect(await checkAccountExists(userId)).toBe(true);
  });

  it.each([
    ["a server error", () => new Response("{}", { status: 500 })],
    ["a body that isn't JSON", () => new Response("nope", { status: 200 })],
    ["an unexpected shape", () => new Response(JSON.stringify({ exists: "no" }), { status: 200 })],
  ])("is null for %s", async (_label, reply) => {
    fetchMock.mockResolvedValue(reply());
    expect(await checkAccountExists(userId)).toBeNull();
  });

  it("is null when offline", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));
    expect(await checkAccountExists(userId)).toBeNull();
  });
});
