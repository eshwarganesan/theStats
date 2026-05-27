import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useGameStore } from "@/lib/store";
import { DeleteEventConfirmModal } from "./DeleteEventConfirmModal";
import { seedReadyGame } from "@/test/seed";
import type { GameEvent } from "@/lib/types";

beforeEach(() => {
  useGameStore.getState().resetAll();
});

function lastEvent<T extends GameEvent["type"]>(
  type: T,
): Extract<GameEvent, { type: T }> {
  const ev = [...useGameStore.getState().events]
    .reverse()
    .find((e) => e.type === type);
  if (!ev) throw new Error(`no ${type} event in store`);
  return ev as Extract<GameEvent, { type: T }>;
}

describe("DeleteEventConfirmModal", () => {
  it("renders nothing when event is null", () => {
    const { container } = render(
      <DeleteEventConfirmModal event={null} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a play summary identifying the event", () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore
      .getState()
      .recordScore("home", players.homePlayer(0).id, "2pt", true);
    const ev = lastEvent("score");

    render(<DeleteEventConfirmModal event={ev} onClose={() => {}} />);
    // The summary mentions the player and the play
    expect(screen.getByText(/Home 1/)).toBeInTheDocument();
  });

  it("Cancel does NOT call deleteEvent", async () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore
      .getState()
      .recordScore("home", players.homePlayer(0).id, "2pt", true);
    const ev = lastEvent("score");
    const user = userEvent.setup();
    const onClose = vi.fn();
    const before = useGameStore.getState().events.length;

    render(<DeleteEventConfirmModal event={ev} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: /Cancel/ }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(useGameStore.getState().events.length).toBe(before);
    expect(useGameStore.getState().events.find((e) => e.id === ev.id)).toBeDefined();
  });

  it("Delete calls deleteEvent(event.id) and dismisses", async () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore
      .getState()
      .recordScore("home", players.homePlayer(0).id, "2pt", true);
    const ev = lastEvent("score");
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<DeleteEventConfirmModal event={ev} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: /^Delete$/ }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(useGameStore.getState().events.find((e) => e.id === ev.id)).toBeUndefined();
  });
});
