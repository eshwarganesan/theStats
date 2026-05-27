import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useGameStore } from "@/lib/store";
import { EditEventModal } from "./EditEventModal";
import { seedReadyGame, addBench } from "@/test/seed";
import type { EditableEvent, GameEvent } from "@/lib/types";

beforeEach(() => {
  useGameStore.getState().resetAll();
});

/** Convenience: type-narrow the last event of a given type. */
function lastEvent<T extends GameEvent["type"]>(
  type: T,
): Extract<GameEvent, { type: T }> {
  const ev = [...useGameStore.getState().events]
    .reverse()
    .find((e) => e.type === type);
  if (!ev) throw new Error(`no ${type} event in store`);
  return ev as Extract<GameEvent, { type: T }>;
}

describe("EditEventModal — score event", () => {
  it("renders all five editable fields pre-filled", () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    const home0 = players.homePlayer(0);
    useGameStore
      .getState()
      .recordScore("home", home0.id, "2pt", true);
    const ev: EditableEvent = lastEvent("score");

    render(<EditEventModal event={ev} onClose={() => {}} />);

    // clockAt input (still a text input)
    expect(screen.getByLabelText(/Clock time/i)).toBeInTheDocument();
    // Tile groups — accessible via role="group"
    expect(screen.getByRole("group", { name: /Side/i })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /Player/i })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /Shot kind/i })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /Outcome/i })).toBeInTheDocument();
  });
});

describe("EditEventModal — foul event", () => {
  it("renders without `Outcome`; shows foul kind", () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore
      .getState()
      .recordFoul("home", players.homePlayer(0).id, "personal");
    const ev = lastEvent("foul");

    render(<EditEventModal event={ev} onClose={() => {}} />);
    expect(screen.queryByRole("group", { name: /Outcome/i })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: /Foul kind/i })).toBeInTheDocument();
  });
});

describe("EditEventModal — stat event", () => {
  it("lists every current rostered player of the chosen side, regardless of starter status", () => {
    const players = seedReadyGame();
    addBench("home", 2); // adds Bench 1 and Bench 2 to home
    useGameStore.getState().startGame();
    useGameStore
      .getState()
      .recordStat("home", players.homePlayer(0).id, "steal");
    const ev = lastEvent("stat");

    render(<EditEventModal event={ev} onClose={() => {}} />);
    // All 7 home players (5 starters + 2 bench) appear as button rows in the
    // Player group.
    const playerGroup = screen.getByRole("group", { name: /Player/i });
    const playerButtons = playerGroup.querySelectorAll("button");
    const buttonTexts = Array.from(playerButtons).map((b) => b.textContent ?? "");
    expect(buttonTexts.some((t) => /Home 1/.test(t))).toBe(true);
    expect(buttonTexts.some((t) => /Bench 1/.test(t))).toBe(true);
    expect(buttonTexts.some((t) => /Bench 2/.test(t))).toBe(true);
  });
});

describe("EditEventModal — timeout event", () => {
  it("renders only clockAt and side (no player, no kind, no outcome)", () => {
    seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().recordTimeout("home");
    const ev = lastEvent("timeout");

    render(<EditEventModal event={ev} onClose={() => {}} />);
    expect(screen.getByLabelText(/Clock time/i)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /Side/i })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /Player/i })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: /Shot kind|Foul kind|Stat kind/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /Outcome/i })).not.toBeInTheDocument();
  });
});

describe("EditEventModal — side change behavior", () => {
  it("resets the player selector and disables Save until a new player is chosen", async () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore
      .getState()
      .recordScore("home", players.homePlayer(0).id, "2pt", true);
    const ev = lastEvent("score");
    const user = userEvent.setup();

    render(<EditEventModal event={ev} onClose={() => {}} />);

    // Click the Away tile in the Side group
    const sideGroup = screen.getByRole("group", { name: /Side/i });
    const awayTile = Array.from(sideGroup.querySelectorAll("button")).find((b) =>
      /Away/i.test(b.textContent ?? ""),
    );
    if (!awayTile) throw new Error("expected an Away tile");
    await user.click(awayTile);

    const save = screen.getByRole("button", { name: /Save/ });
    expect(save).toBeDisabled();

    // Player group now lists the Away roster (Away 1..Away 5)
    const playerGroup = screen.getByRole("group", { name: /Player/i });
    const buttonTexts = Array.from(playerGroup.querySelectorAll("button")).map(
      (b) => b.textContent ?? "",
    );
    expect(buttonTexts.some((t) => /Away 1/.test(t))).toBe(true);
    expect(buttonTexts.some((t) => /Home 1/.test(t))).toBe(false);
  });
});

describe("EditEventModal — clockAt validation", () => {
  it("disables Save and shows an error for unparseable clockAt", async () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore
      .getState()
      .recordScore("home", players.homePlayer(0).id, "2pt", true);
    const ev = lastEvent("score");
    const user = userEvent.setup();

    render(<EditEventModal event={ev} onClose={() => {}} />);

    const clockInput = screen.getByLabelText(/Clock time/i) as HTMLInputElement;
    await user.clear(clockInput);
    await user.type(clockInput, "abc");

    expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();
    expect(screen.getByText(/invalid|out of range|cannot/i)).toBeInTheDocument();
  });

  it("disables Save and shows an error for out-of-range clockAt", async () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore
      .getState()
      .recordScore("home", players.homePlayer(0).id, "2pt", true);
    const ev = lastEvent("score");
    const user = userEvent.setup();

    render(<EditEventModal event={ev} onClose={() => {}} />);

    const clockInput = screen.getByLabelText(/Clock time/i) as HTMLInputElement;
    await user.clear(clockInput);
    // Period length is 10 minutes; 25:00 exceeds it
    await user.type(clockInput, "25:00");

    expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();
    expect(screen.getByText(/out of range|exceeds/i)).toBeInTheDocument();
  });
});

describe("EditEventModal — Save and Cancel", () => {
  it("Save calls editEvent with only the changed fields", async () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore
      .getState()
      .recordScore("home", players.homePlayer(0).id, "2pt", true);
    const ev = lastEvent("score");
    const home1 = players.homePlayer(1);
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<EditEventModal event={ev} onClose={onClose} />);

    // Click the row for the new player in the Player group
    const playerGroup = screen.getByRole("group", { name: /Player/i });
    const home1Tile = Array.from(playerGroup.querySelectorAll("button")).find(
      (b) => new RegExp(home1.name).test(b.textContent ?? ""),
    );
    if (!home1Tile) throw new Error("expected a Home 2 tile");
    await user.click(home1Tile);
    await user.click(screen.getByRole("button", { name: /Save/ }));

    expect(onClose).toHaveBeenCalledOnce();
    const after = useGameStore.getState().events.find((e) => e.id === ev.id);
    if (!after || after.type !== "score") throw new Error("expected score");
    expect(after.playerId).toBe(home1.id);
    // Other fields preserved
    expect(after.kind).toBe(ev.kind);
    expect(after.made).toBe(ev.made);
    expect(after.clockAt).toBe(ev.clockAt);
    expect(after.side).toBe(ev.side);
  });

  it("Cancel does not modify the event", async () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore
      .getState()
      .recordScore("home", players.homePlayer(0).id, "2pt", true);
    const ev = lastEvent("score");
    const before = { ...ev };
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<EditEventModal event={ev} onClose={onClose} />);

    const home1 = players.homePlayer(1);
    const playerGroup = screen.getByRole("group", { name: /Player/i });
    const home1Tile = Array.from(playerGroup.querySelectorAll("button")).find(
      (b) => new RegExp(home1.name).test(b.textContent ?? ""),
    );
    if (!home1Tile) throw new Error("expected a Home 2 tile");
    await user.click(home1Tile);
    await user.click(screen.getByRole("button", { name: /Cancel/ }));

    expect(onClose).toHaveBeenCalledOnce();
    const after = useGameStore.getState().events.find((e) => e.id === ev.id);
    if (!after || after.type !== "score") throw new Error("expected score");
    expect(after.playerId).toBe(before.playerId);
  });
});

describe("EditEventModal — closed state", () => {
  it("renders nothing when event is null", () => {
    const { container } = render(
      <EditEventModal event={null} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
