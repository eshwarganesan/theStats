/**
 * DeleteGameDialog tests.
 * Feature 009-account-library, task T058.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LibraryEntry as Entry } from "@/lib/games/types";
import { DeleteGameDialog } from "./DeleteGameDialog";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: "game-1",
    status: "in-progress",
    homeTeamName: "Central High",
    awayTeamName: "Eastridge",
    homeScore: 12,
    awayScore: 8,
    eventCount: 47,
    currentPeriod: 2,
    startedAt: "2026-07-22T18:00:00Z",
    lastActivityAt: "2026-07-22T19:00:00Z",
    finishedAt: null,
    ...overrides,
  };
}

describe("DeleteGameDialog", () => {
  it("in-progress variant surfaces the event count and current period", () => {
    render(
      <DeleteGameDialog
        entry={makeEntry({ eventCount: 47, currentPeriod: 2 })}
        open
        onClose={() => {}}
        onDeleted={() => {}}
      />,
    );
    // Copy names the event count explicitly (FR-025 in-progress warning).
    expect(screen.getByText(/47 event/i)).toBeInTheDocument();
    expect(screen.getByText(/period 2/i)).toBeInTheDocument();
  });

  it("finished variant uses a generic destructive confirmation copy", () => {
    render(
      <DeleteGameDialog
        entry={makeEntry({ status: "finished", finishedAt: "2026-07-22T21:00:00Z", eventCount: 200 })}
        open
        onClose={() => {}}
        onDeleted={() => {}}
      />,
    );
    // No event-count warning on the finished variant.
    expect(screen.queryByText(/200 event/i)).toBeNull();
    // The generic wording still identifies what will be deleted.
    expect(screen.getByText(/central high/i)).toBeInTheDocument();
  });

  it("Confirm → DELETE /api/games/:id and calls onDeleted", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return new Response(null, { status: 204 });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const onDeleted = vi.fn();
    const onClose = vi.fn();

    render(
      <DeleteGameDialog
        entry={makeEntry()}
        open
        onClose={onClose}
        onDeleted={onDeleted}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const call = fetchMock.mock.calls[0];
    expect(call![0]).toBe("/api/games/game-1");
    expect((call![1] as RequestInit).method).toBe("DELETE");
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });

  it("Cancel → closes without a network call", () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const onClose = vi.fn();
    const onDeleted = vi.fn();

    render(
      <DeleteGameDialog
        entry={makeEntry()}
        open
        onClose={onClose}
        onDeleted={onDeleted}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
