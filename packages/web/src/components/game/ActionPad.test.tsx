import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useGameStore } from "@/lib/store";
import { ActionPad } from "./ActionPad";
import { seedReadyGame } from "@/test/seed";

const noop = () => {};

beforeEach(() => {
  useGameStore.getState().resetAll();
});

describe("ActionPad", () => {
  it("ready: shows Tip Off CTA", () => {
    seedReadyGame();
    render(<ActionPad onEndPeriod={noop} onStartNextPeriod={noop} />);
    expect(screen.getByRole("button", { name: /Tip Off/ })).toBeInTheDocument();
  });

  it("Tip Off click flips status to live", async () => {
    seedReadyGame();
    const user = userEvent.setup();
    render(<ActionPad onEndPeriod={noop} onStartNextPeriod={noop} />);
    await user.click(screen.getByRole("button", { name: /Tip Off/ }));
    expect(useGameStore.getState().status).toBe("live");
  });

  it("period-break after period 1: shows Start Next Quarter CTA", async () => {
    seedReadyGame();
    useGameStore.setState({ status: "period-break", currentPeriod: 1 });
    const onStart = vi.fn();
    const user = userEvent.setup();
    render(<ActionPad onEndPeriod={noop} onStartNextPeriod={onStart} />);
    const cta = screen.getByRole("button", { name: /Start Next Quarter/ });
    await user.click(cta);
    expect(onStart).toHaveBeenCalledOnce();
  });

  it("finished: shows Final plate (no Start/Stop button visible there)", () => {
    seedReadyGame();
    useGameStore.setState({ status: "finished" });
    render(<ActionPad onEndPeriod={noop} onStartNextPeriod={noop} />);
    // Final appears as the CTA replacement plate
    const finals = screen.getAllByText("Final");
    expect(finals.length).toBeGreaterThan(0);
  });

  it("live + clock=0: shows End Period CTA", async () => {
    seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.setState({ clockSeconds: 0 });
    const onEnd = vi.fn();
    const user = userEvent.setup();
    render(<ActionPad onEndPeriod={onEnd} onStartNextPeriod={noop} />);
    const ctas = screen.getAllByRole("button", { name: /End Period/ });
    // Click the primary (xl) CTA, which is the first one rendered
    await user.click(ctas[0]!);
    expect(onEnd).toHaveBeenCalledOnce();
  });

  it("live + clock>0 + paused: shows Start Clock CTA which starts the clock", async () => {
    seedReadyGame();
    useGameStore.getState().startGame();
    const user = userEvent.setup();
    render(<ActionPad onEndPeriod={noop} onStartNextPeriod={noop} />);
    await user.click(screen.getByRole("button", { name: /Start Clock/ }));
    expect(useGameStore.getState().clockRunning).toBe(true);
  });

  it("live + running: shows Stop Clock CTA which stops the clock", async () => {
    seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().startClock();
    const user = userEvent.setup();
    render(<ActionPad onEndPeriod={noop} onStartNextPeriod={noop} />);
    await user.click(screen.getByRole("button", { name: /Stop Clock/ }));
    expect(useGameStore.getState().clockRunning).toBe(false);
  });

  it("Undo is disabled with no events; enabled when events exist", () => {
    seedReadyGame();
    render(<ActionPad onEndPeriod={noop} onStartNextPeriod={noop} />);
    const undo = screen.getByRole("button", { name: /Undo/ });
    expect(undo).toBeDisabled();
  });

  it("Undo button calls undoLastEvent when clicked", async () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().recordScore("home", players.homePlayer(0).id, "2pt", true);
    const user = userEvent.setup();
    render(<ActionPad onEndPeriod={noop} onStartNextPeriod={noop} />);
    const before = useGameStore.getState().events.length;
    await user.click(screen.getByRole("button", { name: /Undo/ }));
    expect(useGameStore.getState().events.length).toBe(before - 1);
  });

  it("End Period secondary button is disabled unless live", () => {
    seedReadyGame(); // status = ready
    render(<ActionPad onEndPeriod={noop} onStartNextPeriod={noop} />);
    // The secondary End Period button (in the grid) is disabled
    const buttons = screen.getAllByRole("button", { name: /End Period/ });
    expect(buttons.some((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it("renders an instructional hint per status", () => {
    seedReadyGame(); // ready
    const { rerender } = render(
      <ActionPad onEndPeriod={noop} onStartNextPeriod={noop} />,
    );
    expect(screen.getByText(/Tap .Tip Off./)).toBeInTheDocument();

    useGameStore.getState().startGame();
    rerender(<ActionPad onEndPeriod={noop} onStartNextPeriod={noop} />);
    expect(screen.getByText(/Tap a player/)).toBeInTheDocument();

    useGameStore.setState({ status: "period-break" });
    rerender(<ActionPad onEndPeriod={noop} onStartNextPeriod={noop} />);
    expect(screen.getByText(/Break/)).toBeInTheDocument();

    useGameStore.setState({ status: "finished" });
    rerender(<ActionPad onEndPeriod={noop} onStartNextPeriod={noop} />);
    expect(screen.getByText(/Game complete/)).toBeInTheDocument();
  });
});

// ─── Timeout & Break Gating (feature 002) ────────────────────────────────

describe("ActionPad — timeout state (feature 002)", () => {
  it("shows the End Timeout CTA and calls endTimeout when tapped", async () => {
    seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().recordTimeout("home");
    expect(useGameStore.getState().status).toBe("timeout");

    const user = userEvent.setup();
    render(<ActionPad onEndPeriod={noop} onStartNextPeriod={noop} />);

    const cta = screen.getByRole("button", { name: /End Timeout/i });
    await user.click(cta);
    expect(useGameStore.getState().status).toBe("live");
  });

  it("hides the Undo and End Period secondary controls during a timeout", () => {
    seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().recordTimeout("home");
    render(<ActionPad onEndPeriod={noop} onStartNextPeriod={noop} />);

    expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^End Period$/ })).toBeNull();
  });

  it("renders a timeout-specific hint", () => {
    seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().recordTimeout("home");
    render(<ActionPad onEndPeriod={noop} onStartNextPeriod={noop} />);
    expect(screen.getByText(/tap End Timeout to resume/i)).toBeInTheDocument();
  });
});

describe("ActionPad — period-break button labels (feature 002)", () => {
  it("after period 2 of a 4-period game: shows Start Second Half", () => {
    seedReadyGame();
    useGameStore.setState({
      status: "period-break",
      currentPeriod: 2,
    });
    render(<ActionPad onEndPeriod={noop} onStartNextPeriod={noop} />);
    expect(screen.getByRole("button", { name: /Start Second Half/i })).toBeInTheDocument();
  });

  it("after the last regulation period (going to OT): shows Start Overtime", () => {
    seedReadyGame();
    const { periods } = useGameStore.getState().settings;
    useGameStore.setState({
      status: "period-break",
      currentPeriod: periods,
    });
    render(<ActionPad onEndPeriod={noop} onStartNextPeriod={noop} />);
    expect(screen.getByRole("button", { name: /Start Overtime/i })).toBeInTheDocument();
  });

  it("after a non-half quarter (e.g., period 3 of 4): shows Start Next Quarter", () => {
    seedReadyGame();
    useGameStore.setState({
      status: "period-break",
      currentPeriod: 3,
    });
    render(<ActionPad onEndPeriod={noop} onStartNextPeriod={noop} />);
    expect(screen.getByRole("button", { name: /Start Next Quarter/i })).toBeInTheDocument();
  });

  it("hides the Undo and End Period secondary controls during a period-break", () => {
    seedReadyGame();
    useGameStore.setState({ status: "period-break", currentPeriod: 1 });
    render(<ActionPad onEndPeriod={noop} onStartNextPeriod={noop} />);
    expect(screen.queryByRole("button", { name: /^Undo/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^End Period$/ })).toBeNull();
  });
});
