import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/env", () => ({
  getServerEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  }),
}));

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

import { createAdminClient } from "./admin";

describe("createAdminClient", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    createClientMock.mockReturnValue({ __mock: "admin-client" });
  });

  it("invokes createClient with the URL + service-role key and disables session persistence", () => {
    const client = createAdminClient();
    expect(client).toEqual({ __mock: "admin-client" });
    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(createClientMock).toHaveBeenCalledWith(
      "http://localhost:54321",
      "service-role-key",
      expect.objectContaining({
        auth: expect.objectContaining({
          autoRefreshToken: false,
          persistSession: false,
        }),
      }),
    );
  });
});
