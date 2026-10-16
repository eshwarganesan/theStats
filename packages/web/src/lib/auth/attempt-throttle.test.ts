import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: rpcMock }),
}));

import { checkAuthAttempt, recordAuthAttempt, throttleKeys } from "./attempt-throttle";

function req(fwd?: string): Request {
  return new Request("http://localhost/api/auth/sign-in", {
    method: "POST",
    headers: fwd === undefined ? {} : { "x-forwarded-for": fwd },
  });
}

beforeEach(() => rpcMock.mockReset());

describe("throttleKeys", () => {
  it("keys on the email and the first forwarded IP", () => {
    expect(throttleKeys("a@b.co", req("203.0.113.9, 10.0.0.1"))).toEqual([
      "e:a@b.co",
      "ip:203.0.113.9",
    ]);
  });

  it("falls back to ip:unknown", () => {
    expect(throttleKeys("a@b.co", req())[1]).toBe("ip:unknown");
    expect(throttleKeys("a@b.co", req(" "))[1]).toBe("ip:unknown");
  });
});

describe("checkAuthAttempt", () => {
  it("calls the RPC through the service-role client", async () => {
    rpcMock.mockResolvedValue({ data: { allowed: false, retry_after_seconds: 4 }, error: null });
    expect(await checkAuthAttempt(["e:x"])).toEqual({ allowed: false, retryAfterSeconds: 4 });
    expect(rpcMock).toHaveBeenCalledWith("is_auth_attempt_allowed", { p_keys: ["e:x"] });
  });

  it("returns null when the lookup errors or returns a malformed row", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "denied" } });
    expect(await checkAuthAttempt(["e:x"])).toBeNull();
    rpcMock.mockResolvedValueOnce({ data: { allowed: "yes" }, error: null });
    expect(await checkAuthAttempt(["e:x"])).toBeNull();
  });
});

describe("recordAuthAttempt", () => {
  it("records the outcome through the service-role client", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await recordAuthAttempt(["e:x", "ip:y"], false);
    expect(rpcMock).toHaveBeenCalledWith("record_auth_attempt", {
      p_keys: ["e:x", "ip:y"],
      p_success: false,
    });
  });
});
