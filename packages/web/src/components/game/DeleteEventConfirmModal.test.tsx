import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useGameStore } from "@/lib/store";
import { DeleteEventConfirmModal } from "./DeleteEventConfirmModal";
import { seedReadyGame } from "@/test/seed";
import type { GameEvent } from "@thestats/core";

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

describe("DeleteEventConfirmModal — play summary wording", () => {
  it("summarizes a missed shot", () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().recordScore("away", players.awayPlayer(0).id, "3pt", false);

    render(<DeleteEventConfirmModal event={lastEvent("score")} onClose={() => {}} />);
    expect(screen.getByText(/missed 3 PT/)).toBeInTheDocument();
  });

  it("summarizes a foul", () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().recordFoul("home", players.homePlayer(0).id, "technical");

    render(<DeleteEventConfirmModal event={lastEvent("foul")} onClose={() => {}} />);
    expect(screen.getByText(/Technical foul/)).toBeInTheDocument();
  });

  it("summarizes a stat", () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().recordStat("home", players.homePlayer(0).id, "block");

    render(<DeleteEventConfirmModal event={lastEvent("stat")} onClose={() => {}} />);
    expect(screen.getByText(/— Block$/)).toBeInTheDocument();
  });

  it("summarizes a team timeout", () => {
    seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().recordTimeout("away");

    render(<DeleteEventConfirmModal event={lastEvent("timeout")} onClose={() => {}} />);
    const awayTag = useGameStore.getState().awayTeam.tag;
    expect(screen.getByText(new RegExp(`${awayTag} timeout`))).toBeInTheDocument();
  });
});
