/**
 * Tests for the account-page Server Actions.
 * Feature 009-account-library, task T015.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { createServerClient } from "@/lib/supabase/server";
import { changePassword, ensureProfile, updateDisplayName } from "./actions";

const mockedCreate = vi.mocked(createServerClient);

type MockClient = {
  auth: {
    getUser: ReturnType<typeof vi.fn>;
    signInWithPassword: ReturnType<typeof vi.fn>;
    updateUser: ReturnType<typeof vi.fn>;
  };
  from: ReturnType<typeof vi.fn>;
};

function buildClient(overrides: Partial<MockClient> = {}): MockClient {
  const baseAuth = {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: "user-1", email: "u@example.com" } },
      error: null,
    }),
    signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
    updateUser: vi.fn().mockResolvedValue({ error: null }),
  };
  return {
    auth: { ...baseAuth, ...(overrides.auth ?? {}) },
    from: overrides.from ?? vi.fn(),
  };
}

/**
 * Build a chainable Supabase-query mock: `.from().insert().select().single()` etc.
 * Each terminal (`.single()`, `.maybeSingle()`) returns a Promise resolving to
 * the supplied result.
 */
function chainable(finalResult: unknown) {
  const chain: Record<string, unknown> = {};
  const impl = () => chain;
  const terminals = { single: vi.fn().mockResolvedValue(finalResult), maybeSingle: vi.fn().mockResolvedValue(finalResult) };
  Object.assign(chain, {
    insert: vi.fn(impl),
    select: vi.fn(impl),
    update: vi.fn(impl),
    upsert: vi.fn(impl),
    eq: vi.fn(impl),
    ...terminals,
    then: undefined,
  });
  return chain;
}

function formData(pairs: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(pairs)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ensureProfile", () => {
  it("upserts the caller's profiles row and returns it", async () => {
    const profileRow = {
      id: "user-1",
      display_name: null,
      created_at: "2026-07-22T00:00:00Z",
      updated_at: "2026-07-22T00:00:00Z",
    };
    const c = buildClient();
    c.from = vi.fn().mockReturnValue(chainable({ data: profileRow, error: null }));
    mockedCreate.mockResolvedValue(c as never);

    const result = await ensureProfile();

    expect(result).toEqual({
      id: "user-1",
      displayName: null,
      createdAt: "2026-07-22T00:00:00Z",
      updatedAt: "2026-07-22T00:00:00Z",
    });
    expect(c.from).toHaveBeenCalledWith("profiles");
  });
});

describe("updateDisplayName", () => {
  it("trims and stores a valid display name", async () => {
    const updated = {
      id: "user-1",
      display_name: "Alex",
      created_at: "2026-07-22T00:00:00Z",
      updated_at: "2026-07-22T00:01:00Z",
    };
    const chain = chainable({ data: updated, error: null });
    const c = buildClient();
    c.from = vi.fn().mockReturnValue(chain);
    mockedCreate.mockResolvedValue(c as never);

    const result = await updateDisplayName(formData({ displayName: "  Alex  " }));

    expect(result).toEqual({
      ok: true,
      value: { displayName: "Alex" },
    });
    expect(chain.update).toHaveBeenCalledWith({ display_name: "Alex" });
  });

  it("stores null when displayName is empty", async () => {
    const chain = chainable({
      data: {
        id: "user-1",
        display_name: null,
        created_at: "2026-07-22T00:00:00Z",
        updated_at: "2026-07-22T00:01:00Z",
      },
      error: null,
    });
    const c = buildClient();
    c.from = vi.fn().mockReturnValue(chain);
    mockedCreate.mockResolvedValue(c as never);

    const result = await updateDisplayName(formData({ displayName: "" }));

    expect(result).toEqual({ ok: true, value: { displayName: null } });
    expect(chain.update).toHaveBeenCalledWith({ display_name: null });
  });

  it("rejects a display name longer than 64 characters", async () => {
    const c = buildClient();
    mockedCreate.mockResolvedValue(c as never);

    const result = await updateDisplayName(
      formData({ displayName: "x".repeat(65) }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("display_name_too_long");
  });
});

describe("changePassword", () => {
  it("returns current_password_incorrect and does NOT call updateUser when re-auth fails", async () => {
    const c = buildClient();
    c.auth.signInWithPassword = vi.fn().mockResolvedValue({
      error: { message: "Invalid login credentials" },
    });
    mockedCreate.mockResolvedValue(c as never);

    const result = await changePassword(
      formData({ currentPassword: "wrong", newPassword: "new-secret" }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("current_password_incorrect");
    expect(c.auth.updateUser).not.toHaveBeenCalled();
  });

  it("returns new_password_rejected verbatim when Supabase rejects the new password", async () => {
    const c = buildClient();
    c.auth.updateUser = vi.fn().mockResolvedValue({
      error: { message: "Password should be at least 6 characters" },
    });
    mockedCreate.mockResolvedValue(c as never);

    const result = await changePassword(
      formData({ currentPassword: "old-secret", newPassword: "x" }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("new_password_rejected");
      expect(result.error.message).toBe(
        "Password should be at least 6 characters",
      );
    }
  });

  it("returns ok on success and keeps the caller signed in", async () => {
    const c = buildClient();
    mockedCreate.mockResolvedValue(c as never);

    const result = await changePassword(
      formData({ currentPassword: "old-secret", newPassword: "new-secret" }),
    );

    expect(result).toEqual({ ok: true, value: { signedIn: true } });
    expect(c.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "u@example.com",
      password: "old-secret",
    });
    expect(c.auth.updateUser).toHaveBeenCalledWith({ password: "new-secret" });
  });
});
