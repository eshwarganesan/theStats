import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/env", () => ({
  getServerEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  }),
}));

const { cookiesMock, getAllMock, setMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  getAllMock: vi.fn(),
  setMock: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

const { createSSRServerClientMock } = vi.hoisted(() => ({
  createSSRServerClientMock: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: createSSRServerClientMock,
}));

import { createServerClient } from "./server";

interface CookiesAdapter {
  getAll: () => Array<{ name: string; value: string }>;
  setAll: (
    cookies: Array<{ name: string; value: string; options?: unknown }>,
  ) => void;
}

describe("createServerClient", () => {
  beforeEach(() => {
    createSSRServerClientMock.mockReset();
    getAllMock.mockReset();
    setMock.mockReset();
    cookiesMock.mockReset();

    createSSRServerClientMock.mockReturnValue({ __mock: "server-client" });
    cookiesMock.mockResolvedValue({ getAll: getAllMock, set: setMock });
  });

  it("forwards URL + anon key and a cookies adapter bound to next/headers", async () => {
    const client = await createServerClient();
    expect(client).toEqual({ __mock: "server-client" });
    expect(createSSRServerClientMock).toHaveBeenCalledTimes(1);
    const [url, anonKey, opts] = createSSRServerClientMock.mock.calls[0]!;
    expect(url).toBe("http://localhost:54321");
    expect(anonKey).toBe("anon-key");
    expect(opts.cookies).toBeDefined();
  });

  it("cookies.getAll() proxies to the cookie store", async () => {
    getAllMock.mockReturnValueOnce([{ name: "sb", value: "abc" }]);
    await createServerClient();
    const opts = createSSRServerClientMock.mock.calls[0]![2] as {
      cookies: CookiesAdapter;
    };
    expect(opts.cookies.getAll()).toEqual([{ name: "sb", value: "abc" }]);
    expect(getAllMock).toHaveBeenCalledTimes(1);
  });

  it("cookies.setAll() writes each cookie via the cookie store", async () => {
    await createServerClient();
    const opts = createSSRServerClientMock.mock.calls[0]![2] as {
      cookies: CookiesAdapter;
    };
    opts.cookies.setAll([
      { name: "sb-1", value: "v1", options: { path: "/" } },
      { name: "sb-2", value: "v2", options: { httpOnly: true } },
    ]);
    expect(setMock).toHaveBeenCalledTimes(2);
    expect(setMock).toHaveBeenNthCalledWith(1, "sb-1", "v1", { path: "/" });
    expect(setMock).toHaveBeenNthCalledWith(2, "sb-2", "v2", { httpOnly: true });
  });

  it("cookies.setAll() swallows errors from the read-only Server Component context", async () => {
    setMock.mockImplementation(() => {
      throw new Error("Cookies can only be modified in a Server Action or Route Handler");
    });
    await createServerClient();
    const opts = createSSRServerClientMock.mock.calls[0]![2] as {
      cookies: CookiesAdapter;
    };
    expect(() =>
      opts.cookies.setAll([{ name: "sb", value: "v", options: {} }]),
    ).not.toThrow();
  });
});
