import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logAuthEvent } from "./log-auth-event";

describe("logAuthEvent", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("emits a single JSON line with the documented fields", () => {
    logAuthEvent({
      handler: "sign-in",
      userId: "u_42",
      outcome: "ok",
      requestId: "req_abc",
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const raw = logSpy.mock.calls[0]?.[0];
    expect(typeof raw).toBe("string");
    const parsed = JSON.parse(raw as string);
    expect(parsed.component).toBe("auth");
    expect(parsed.handler).toBe("sign-in");
    expect(parsed.user_id).toBe("u_42");
    expect(parsed.outcome).toBe("ok");
    expect(parsed.request_id).toBe("req_abc");
    expect(typeof parsed.timestamp).toBe("string");
  });

  it("records a null userId verbatim (anonymous sign-up entry)", () => {
    logAuthEvent({
      handler: "sign-up",
      userId: null,
      outcome: "invalid_input",
      requestId: "req_x",
    });
    const parsed = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(parsed.user_id).toBeNull();
  });
});
