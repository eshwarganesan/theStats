import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useGameStore } from "@/lib/store";
import { ActionModal } from "./ActionModal";
import { seedReadyGame } from "@/test/seed";

beforeEach(() => {
  useGameStore.getState().resetAll();
});

function setup(capturedClockAt: number | null = null) {
  const players = seedReadyGame();
  useGameStore.getState().startGame();
  const onClose = vi.fn();
  const playerId = players.homePlayer(0).id;
  const r = render(
    <ActionModal
      open
      onClose={onClose}
      side="home"
      playerId={playerId}
      capturedClockAt={capturedClockAt}
    />,
  );
  return { onClose, playerId, ...r };
}

describe("ActionModal — return null guards", () => {
  it("returns null when side is null", () => {
    seedReadyGame();
    const { container } = render(
      <ActionModal
        open
        onClose={() => {}}
        side={null}
        playerId="x"
        capturedClockAt={null}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when playerId is null", () => {
    seedReadyGame();
    const { container } = render(
      <ActionModal
        open
        onClose={() => {}}
        side="home"
        playerId={null}
        capturedClockAt={null}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when player is not in roster", () => {
    seedReadyGame();
    const { container } = render(
      <ActionModal
        open
        onClose={() => {}}
        side="home"
        playerId="bogus"
        capturedClockAt={null}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("ActionModal — title", () => {
  it("renders the player number and name in the title", () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    render(
      <ActionModal
        open
        onClose={() => {}}
        side="home"
        playerId={players.homePlayer(0).id}
        capturedClockAt={null}
      />,
    );
    expect(
      screen.getByRole("heading", {
        name: `#${players.homePlayer(0).number} ${players.homePlayer(0).name}`,
      }),
    ).toBeInTheDocument();
  });
});

describe("ActionModal — score actions", () => {
  it.each([
    [/^\+2 Made/, "2pt", true],
    [/^2 Missed/, "2pt", false],
    [/^\+3 Made/, "3pt", true],
    [/^3 Missed/, "3pt", false],
    [/^\+1 Made/, "ft", true],
    [/^1 Missed/, "ft", false],
  ] as const)("%s dispatches recordScore with kind=%s made=%s", async (label, kind, made) => {
    const { onClose, playerId } = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: label }));

    const last = useGameStore.getState().events.at(-1);
    expect(last?.type).toBe("score");
    if (last?.type === "score") {
      expect(last.kind).toBe(kind);
      expect(last.made).toBe(made);
      expect(last.playerId).toBe(playerId);
      expect(last.side).toBe("home");
    }
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("ActionModal — fouls", () => {
  it.each([
    ["Personal", "personal"],
    ["Technical", "technical"],
    ["Unsportsmanlike", "unsportsmanlike"],
    ["Disqualifying", "disqualifying"],
  ] as const)("%s dispatches recordFoul kind=%s", async (label, kind) => {
    const { onClose, playerId } = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: label }));

    const last = useGameStore.getState().events.at(-1);
    expect(last?.type).toBe("foul");
    if (last?.type === "foul") {
      expect(last.kind).toBe(kind);
      expect(last.playerId).toBe(playerId);
    }
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("ActionModal — stats", () => {
  it.each([
    ["Off. Rebound", "rebound-off"],
    ["Def. Rebound", "rebound-def"],
    ["Assist", "assist"],
    ["Steal", "steal"],
    ["Block", "block"],
    ["Turnover", "turnover"],
  ] as const)("%s dispatches recordStat kind=%s", async (label, kind) => {
    const { onClose, playerId } = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: label }));

    const last = useGameStore.getState().events.at(-1);
    expect(last?.type).toBe("stat");
    if (last?.type === "stat") {
      expect(last.kind).toBe(kind);
      expect(last.playerId).toBe(playerId);
    }
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("ActionModal — cancel", () => {
  it("clicking Cancel closes without dispatching", async () => {
    const { onClose } = setup();
    const before = useGameStore.getState().events.length;
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Cancel/ }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(useGameStore.getState().events.length).toBe(before);
  });
});

describe("ActionModal — captured clockAt", () => {
  it("stamps the captured tap-time on the recorded event, not the live clock", async () => {
    // Captured at tap: 600s. Then the clock ticks down to 593s before the
    // user picks an action. The recorded event must reflect 600, not 593.
    const { playerId } = setup(600);
    useGameStore.setState({ clockSeconds: 593 });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^\+2 Made/ }));

    const last = useGameStore.getState().events.at(-1);
    expect(last?.type).toBe("score");
    if (last?.type === "score") {
      expect(last.clockAt).toBe(600);
      expect(last.playerId).toBe(playerId);
    }
  });

  it("falls back to the live clock when no capture is provided", async () => {
    setup(null);
    useGameStore.setState({ clockSeconds: 421 });

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Personal/ }));

    const last = useGameStore.getState().events.at(-1);
    expect(last?.type).toBe("foul");
    if (last?.type === "foul") {
      expect(last.clockAt).toBe(421);
    }
  });

  it("renders the captured time pill", () => {
    setup(125); // 02:05
    expect(screen.getByTestId("captured-clock-at")).toHaveTextContent("02:05");
  });
});
