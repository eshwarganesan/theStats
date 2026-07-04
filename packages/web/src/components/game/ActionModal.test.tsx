import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

describe("ActionModal — embedded clock strip", () => {
  it("shows the live clock, not the captured time", () => {
    setup(120); // captured at tap = 120
    // 5v5 seed leaves clockSeconds at the period length (10:00 / 600s).
    // The strip displays the live clock; the captured time is separate.
    const strip = screen.getByTestId("modal-clock-strip");
    expect(strip).toHaveTextContent("10:00");
    expect(screen.getByTestId("captured-clock-at")).toHaveTextContent("02:00");
  });

  it("starts the clock from the strip when paused", async () => {
    setup(600);
    expect(useGameStore.getState().clockRunning).toBe(false);

    const user = userEvent.setup();
    const strip = screen.getByTestId("modal-clock-strip");
    await user.click(within(strip).getByRole("button", { name: "Start" }));

    expect(useGameStore.getState().clockRunning).toBe(true);
  });

  it("stops the clock from the strip when running", async () => {
    setup(600);
    const user = userEvent.setup();
    const strip = screen.getByTestId("modal-clock-strip");

    // Route the initial start through the UI so React commits before the
    // next query — a direct store call wouldn't flush the re-render.
    await user.click(within(strip).getByRole("button", { name: "Start" }));
    expect(useGameStore.getState().clockRunning).toBe(true);

    await user.click(within(strip).getByRole("button", { name: "Stop" }));
    expect(useGameStore.getState().clockRunning).toBe(false);
  });

  it("hides nudges once the clock is running", async () => {
    setup(600);
    const user = userEvent.setup();
    const strip = screen.getByTestId("modal-clock-strip");

    // Paused → nudges visible.
    expect(within(strip).getByRole("button", { name: "+1s" })).toBeInTheDocument();

    await user.click(within(strip).getByRole("button", { name: "Start" }));

    expect(within(strip).queryByRole("button", { name: "+1s" })).toBeNull();
    expect(within(strip).queryByRole("button", { name: "−1s" })).toBeNull();
  });

  it("nudges adjust the live clock, leaving the captured tap-time untouched", async () => {
    setup(600); // captured at tap
    // 5v5 seed leaves the live clock at 600s.
    expect(useGameStore.getState().clockSeconds).toBe(600);

    const user = userEvent.setup();
    const strip = screen.getByTestId("modal-clock-strip");
    await user.click(within(strip).getByRole("button", { name: "−1s" }));

    // Live clock moved to 599; the pill still shows the captured 600.
    expect(useGameStore.getState().clockSeconds).toBe(599);
    expect(screen.getByTestId("captured-clock-at")).toHaveTextContent("10:00");

    // Recorded event uses the captured tap-time (600), not the nudged live
    // clock (599) — proves Layer 1 + Layer 3(a) compose correctly.
    await user.click(screen.getByRole("button", { name: /^\+2 Made/ }));
    const last = useGameStore.getState().events.at(-1);
    expect(last?.type).toBe("score");
    if (last?.type === "score") expect(last.clockAt).toBe(600);
  });
});
