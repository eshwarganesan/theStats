/**
 * Unit tests for `deleteOwnAccount`: throttle, password check, admin delete.
 * Feature 018-account-deletion, task T008.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/attempt-throttle", () => ({
  throttleKeys: vi.fn((email: string) => [`e:${email}`, "ip:203.0.113.9"]),
  checkAuthAttempt: vi.fn(),
  recordAuthAttempt: vi.fn(),
}));
vi.mock("@/lib/supabase/stateless", () => ({ createStatelessClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { checkAuthAttempt, recordAuthAttempt, throttleKeys } from "@/lib/auth/attempt-throttle";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStatelessClient } from "@/lib/supabase/stateless";
import { deleteOwnAccount } from "./delete-account";

const KEYS = ["e:coach@example.com", "ip:203.0.113.9"];

function fakeVerifier(signInError: { message: string } | null) {
  return {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({
        data: signInError ? { user: null, session: null } : { user: { id: "user-1" }, session: {} },
        error: signInError,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  };
}

type AuthErrorLike = { status?: number; code?: string; message: string };

function fakeAdmin(deleteError: AuthErrorLike | null, lookupError: AuthErrorLike | null = null) {
  return {
    auth: {
      admin: {
        deleteUser: vi.fn().mockResolvedValue({ data: { user: null }, error: deleteError }),
        getUserById: vi.fn().mockResolvedValue({
          data: { user: lookupError ? null : { id: "user-1" } },
          error: lookupError,
        }),
      },
    },
  };
}

let verifier: ReturnType<typeof fakeVerifier>;
let admin: ReturnType<typeof fakeAdmin>;

function arrange(opts: {
  allowed?: { allowed: boolean; retryAfterSeconds: number } | null;
  signInError?: { message: string } | null;
  deleteError?: AuthErrorLike | null;
  lookupError?: AuthErrorLike | null;
}) {
  vi.mocked(checkAuthAttempt).mockResolvedValue(
    opts.allowed === undefined ? { allowed: true, retryAfterSeconds: 0 } : opts.allowed,
  );
  verifier = fakeVerifier(opts.signInError ?? null);
  admin = fakeAdmin(opts.deleteError ?? null, opts.lookupError ?? null);
  vi.mocked(createStatelessClient).mockReturnValue(
    verifier as unknown as ReturnType<typeof createStatelessClient>,
  );
  vi.mocked(createAdminClient).mockReturnValue(
    admin as unknown as ReturnType<typeof createAdminClient>,
  );
}

const request = new Request("http://localhost/api/account/delete", { method: "POST" });
const input = { request, userId: "user-1", email: " Coach@Example.com ", password: "pw" };

beforeEach(() => {
  vi.mocked(checkAuthAttempt).mockReset();
  vi.mocked(recordAuthAttempt).mockReset();
  vi.mocked(throttleKeys).mockClear();
});

describe("deleteOwnAccount", () => {
  it("throttles on the normalized email, matching sign-in's e:<email> key", async () => {
    arrange({});
    await deleteOwnAccount(input);
    expect(throttleKeys).toHaveBeenCalledWith("coach@example.com", request);
    expect(checkAuthAttempt).toHaveBeenCalledWith(KEYS);
  });

  it("fails closed when the throttle lookup fails, without checking the password", async () => {
    arrange({ allowed: null });
    expect(await deleteOwnAccount(input)).toEqual({ kind: "error", stage: "throttle" });
    expect(verifier.auth.signInWithPassword).not.toHaveBeenCalled();
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("reports the wait when the limit is reached", async () => {
    arrange({ allowed: { allowed: false, retryAfterSeconds: 8 } });
    expect(await deleteOwnAccount(input)).toEqual({ kind: "rate-limited", retryAfterSeconds: 8 });
    expect(verifier.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("records a failure and deletes nothing when the password is wrong", async () => {
    arrange({ signInError: { message: "Invalid login credentials" } });
    expect(await deleteOwnAccount(input)).toEqual({ kind: "wrong-password" });
    expect(verifier.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "coach@example.com",
      password: "pw",
    });
    expect(recordAuthAttempt).toHaveBeenCalledWith(KEYS, false);
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("counts a failed check as deleted when the account is already gone (a racing duplicate)", async () => {
    arrange({
      signInError: { message: "Invalid login credentials" },
      lookupError: { status: 404, code: "user_not_found", message: "User not found" },
    });
    expect(await deleteOwnAccount(input)).toEqual({ kind: "deleted" });
    expect(admin.auth.admin.getUserById).toHaveBeenCalledWith("user-1");
    expect(recordAuthAttempt).not.toHaveBeenCalled();
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("records a success, then hard-deletes the caller's own account", async () => {
    arrange({});
    expect(await deleteOwnAccount(input)).toEqual({ kind: "deleted" });
    expect(recordAuthAttempt).toHaveBeenCalledWith(KEYS, true);
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith("user-1", false);
  });

  it.each([
    { status: 404, message: "User not found" },
    { code: "user_not_found", message: "User not found" },
  ])("treats an already-deleted account as deleted (%o)", async (deleteError) => {
    arrange({ deleteError });
    expect(await deleteOwnAccount(input)).toEqual({ kind: "deleted" });
    expect(verifier.auth.signOut).not.toHaveBeenCalled();
  });

  it("revokes only the check's session and reports an error when the delete fails", async () => {
    arrange({ deleteError: { status: 500, code: "unexpected_failure", message: "boom" } });
    expect(await deleteOwnAccount(input)).toEqual({ kind: "error", stage: "delete" });
    expect(verifier.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
