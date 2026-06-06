import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/env", () => ({
  getPublicEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  }),
}));

const { createBrowserClientMock } = vi.hoisted(() => ({
  createBrowserClientMock: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: createBrowserClientMock,
}));

import { createBrowserClient } from "./client";

describe("createBrowserClient (browser)", () => {
  beforeEach(() => {
    createBrowserClientMock.mockReset();
    createBrowserClientMock.mockReturnValue({ __mock: "browser-client" });
  });

  it("forwards the public URL + anon key to @supabase/ssr's createBrowserClient", () => {
    const client = createBrowserClient();
    expect(client).toEqual({ __mock: "browser-client" });
    expect(createBrowserClientMock).toHaveBeenCalledTimes(1);
    expect(createBrowserClientMock).toHaveBeenCalledWith(
      "http://localhost:54321",
      "anon-key",
    );
  });
});
