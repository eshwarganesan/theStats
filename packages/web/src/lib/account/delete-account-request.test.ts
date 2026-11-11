/**
 * Tests for the browser's call to POST /api/account/delete.
 * Feature 018-account-deletion, task T025.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestAccountDeletion } from "./delete-account-request";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("requestAccountDeletion", () => {
  it("posts the password as JSON to the delete endpoint", async () => {
    const fetchMock = stubFetch(new Response(null, { status: 204 }));

    await requestAccountDeletion("hunter22");

    expect(fetchMock).toHaveBeenCalledWith("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "hunter22" }),
    });
  });

  it("maps a 204 to deleted", async () => {
    stubFetch(new Response(null, { status: 204 }));
    expect(await requestAccountDeletion("pw")).toEqual({ kind: "deleted" });
  });

  it("maps an error envelope through the shared mapping", async () => {
    stubFetch(
      new Response(
        JSON.stringify({ error: { code: "rate_limited", message: "m", retry_after_seconds: 3 } }),
        { status: 429 },
      ),
    );
    expect(await requestAccountDeletion("pw")).toEqual({ kind: "rate-limited", retryAfterSeconds: 3 });
  });

  it("copes with a body that isn't JSON", async () => {
    stubFetch(new Response("<html>bad gateway</html>", { status: 502 }));
    expect(await requestAccountDeletion("pw")).toEqual({ kind: "failed" });
  });

  it("reports offline when the request never completes", async () => {
    stubFetch(new TypeError("Failed to fetch"));
    expect(await requestAccountDeletion("pw")).toEqual({ kind: "offline" });
  });
});
