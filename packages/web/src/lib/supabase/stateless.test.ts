import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/env", () => ({
  getPublicEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  }),
}));

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

import { createStatelessClient } from "./stateless";

describe("createStatelessClient", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    createClientMock.mockReturnValue({ __mock: "stateless-client" });
  });

  it("uses the anon key and keeps the session out of cookies and storage", () => {
    const client = createStatelessClient();
    expect(client).toEqual({ __mock: "stateless-client" });
    expect(createClientMock).toHaveBeenCalledWith(
      "http://localhost:54321",
      "anon-key",
      expect.objectContaining({
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      }),
    );
  });
});
