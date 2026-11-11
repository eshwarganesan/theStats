/**
 * Unit tests for `accountExists`, the lookup behind GET /api/account/status.
 * Feature 018-account-deletion, task T070.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { accountExists } from "./account-status";

const getUserById = vi.fn();

beforeEach(() => {
  getUserById.mockReset();
  vi.mocked(createAdminClient).mockReturnValue({
    auth: { admin: { getUserById } },
  } as unknown as ReturnType<typeof createAdminClient>);
});

describe("accountExists", () => {
  it("is true for a user that exists", async () => {
    getUserById.mockResolvedValue({ data: { user: { id: "u-1" } }, error: null });
    expect(await accountExists("u-1")).toBe(true);
    expect(getUserById).toHaveBeenCalledWith("u-1");
  });

  it.each([
    { status: 404, message: "User not found" },
    { code: "user_not_found", message: "User not found" },
  ])("is false when Auth has no such user (%o)", async (error) => {
    getUserById.mockResolvedValue({ data: { user: null }, error });
    expect(await accountExists("u-1")).toBe(false);
  });

  it("is null when the lookup itself fails", async () => {
    getUserById.mockResolvedValue({ data: { user: null }, error: { status: 500, message: "boom" } });
    expect(await accountExists("u-1")).toBeNull();
  });
});
