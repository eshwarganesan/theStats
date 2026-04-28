import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useGameStore } from "@/lib/store";
import { ClockAdjuster } from "./ClockAdjuster";
import { formatClock } from "@/lib/utils";

beforeEach(() => {
  useGameStore.getState().resetAll();
});

/**
 * Helper: drive the store to a live + paused state with a known clock value.
 * Bypasses the setup→ready→live ceremony for unit-test focus.
 */
function setLivePaused(clockSeconds: number) {
  useGameStore.setState({
    status: "live",
    clockSeconds,
    clockRunning: false,
  });
}

describe("ClockAdjuster — visibility gating (US1)", () => {
  it("renders only the formatted display (no edit trigger) when status is setup", () => {
    useGameStore.setState({ status: "setup", clockSeconds: 305 });
    render(<ClockAdjuster />);
    expect(screen.getByText(formatClock(305))).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /adjust clock/i })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("renders only the formatted display when status is finished", () => {
    useGameStore.setState({ status: "finished", clockSeconds: 305 });
    render(<ClockAdjuster />);
    expect(screen.queryByRole("button", { name: /adjust clock/i })).toBeNull();
  });

  it("renders only the formatted display when status is period-break", () => {
    useGameStore.setState({ status: "period-break", clockSeconds: 305 });
    render(<ClockAdjuster />);
    expect(screen.queryByRole("button", { name: /adjust clock/i })).toBeNull();
  });

  it("renders only the formatted display when the clock is running", () => {
    useGameStore.setState({
      status: "live",
      clockSeconds: 305,
      clockRunning: true,
    });
    render(<ClockAdjuster />);
    expect(screen.queryByRole("button", { name: /adjust clock/i })).toBeNull();
  });

  it("renders the edit trigger when live and paused", () => {
    setLivePaused(305);
    render(<ClockAdjuster />);
    expect(screen.getByRole("button", { name: /adjust clock/i })).toBeInTheDocument();
    expect(screen.getByText(formatClock(305))).toBeInTheDocument();
  });
});

describe("ClockAdjuster — typed editor (US1)", () => {
  it("tapping the clock surfaces an mm:ss input pre-filled with the current value", async () => {
    setLivePaused(462);
    const user = userEvent.setup();
    render(<ClockAdjuster />);
    await user.click(screen.getByRole("button", { name: /adjust clock/i }));
    const input = screen.getByRole("textbox", { name: /clock time, minutes and seconds/i });
    expect(input).toHaveValue("07:42");
    expect(input).toHaveFocus();
  });

  it("commits a valid typed entry on Enter and updates clockSeconds", async () => {
    setLivePaused(462);
    const user = userEvent.setup();
    render(<ClockAdjuster />);
    await user.click(screen.getByRole("button", { name: /adjust clock/i }));
    const input = screen.getByRole("textbox", { name: /clock time, minutes and seconds/i });
    await user.clear(input);
    await user.type(input, "5:00{enter}");
    expect(useGameStore.getState().clockSeconds).toBe(300);
    expect(screen.getByText(formatClock(300))).toBeInTheDocument();
  });

  it("commits a valid typed entry on blur", async () => {
    setLivePaused(462);
    const user = userEvent.setup();
    render(
      <>
        <ClockAdjuster />
        <button>elsewhere</button>
      </>,
    );
    await user.click(screen.getByRole("button", { name: /adjust clock/i }));
    const input = screen.getByRole("textbox", { name: /clock time, minutes and seconds/i });
    await user.clear(input);
    await user.type(input, "3:30");
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(useGameStore.getState().clockSeconds).toBe(210);
  });

  it("invalid typed entry preserves the prior value and emits no event", async () => {
    setLivePaused(462);
    const beforeEvents = useGameStore.getState().events.length;
    const user = userEvent.setup();
    render(<ClockAdjuster />);
    await user.click(screen.getByRole("button", { name: /adjust clock/i }));
    const input = screen.getByRole("textbox", { name: /clock time, minutes and seconds/i });
    await user.clear(input);
    await user.type(input, "abc{enter}");
    expect(useGameStore.getState().clockSeconds).toBe(462);
    expect(useGameStore.getState().events.length).toBe(beforeEvents);
  });

  it("Escape discards an in-progress edit", async () => {
    setLivePaused(462);
    const beforeEvents = useGameStore.getState().events.length;
    const user = userEvent.setup();
    render(<ClockAdjuster />);
    await user.click(screen.getByRole("button", { name: /adjust clock/i }));
    const input = screen.getByRole("textbox", { name: /clock time, minutes and seconds/i });
    await user.clear(input);
    await user.type(input, "9:99");
    await user.keyboard("{Escape}");
    expect(useGameStore.getState().clockSeconds).toBe(462);
    expect(useGameStore.getState().events.length).toBe(beforeEvents);
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("ClockAdjuster — accessibility (US1)", () => {
  it("the edit input has an accessible name including 'minutes and seconds'", async () => {
    setLivePaused(305);
    const user = userEvent.setup();
    render(<ClockAdjuster />);
    await user.click(screen.getByRole("button", { name: /adjust clock/i }));
    expect(
      screen.getByRole("textbox", { name: /minutes and seconds/i }),
    ).toBeInTheDocument();
  });
});

describe("ClockAdjuster — nudges (US2)", () => {
  it("+1s increments the displayed value and records one event", async () => {
    setLivePaused(305);
    const beforeEvents = useGameStore.getState().events.length;
    const user = userEvent.setup();
    render(<ClockAdjuster />);
    await user.click(screen.getByRole("button", { name: /^\+1s$/i }));
    expect(useGameStore.getState().clockSeconds).toBe(306);
    expect(useGameStore.getState().events.length).toBe(beforeEvents + 1);
    expect(screen.getByText(formatClock(306))).toBeInTheDocument();
  });

  it("−1s decrements the displayed value", async () => {
    setLivePaused(305);
    const user = userEvent.setup();
    render(<ClockAdjuster />);
    await user.click(screen.getByRole("button", { name: /^−1s$/i }));
    expect(useGameStore.getState().clockSeconds).toBe(304);
  });

  it("five rapid +1s taps produce a single coalesced event with from→to bracketing the session", () => {
    setLivePaused(305);
    const beforeEvents = useGameStore.getState().events.length;
    render(<ClockAdjuster />);
    const plus = screen.getByRole("button", { name: /^\+1s$/i });
    for (let i = 0; i < 5; i++) plus.click();
    expect(useGameStore.getState().clockSeconds).toBe(310);
    // Coalescing happens inside the store; only one new event is appended.
    expect(useGameStore.getState().events.length).toBe(beforeEvents + 1);
    const last = useGameStore.getState().events.at(-1);
    if (last?.type === "clock" && last.action === "adjust") {
      expect(last.from).toBe(305);
      expect(last.to).toBe(310);
    } else {
      throw new Error("expected a clock/adjust event");
    }
  });

  it("disables −1s at 0 and +1s at the period max", () => {
    setLivePaused(0);
    const { rerender } = render(<ClockAdjuster />);
    expect(screen.getByRole("button", { name: /^−1s$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^\+1s$/i })).not.toBeDisabled();

    setLivePaused(useGameStore.getState().settings.periodSeconds);
    rerender(<ClockAdjuster />);
    expect(screen.getByRole("button", { name: /^\+1s$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^−1s$/i })).not.toBeDisabled();
  });

  it("uses overtimeSeconds as the +1s ceiling during overtime", () => {
    const ot = useGameStore.getState().settings.overtimeSeconds;
    useGameStore.setState({
      status: "live",
      clockRunning: false,
      currentPeriod: useGameStore.getState().settings.periods + 1,
      clockSeconds: ot,
    });
    render(<ClockAdjuster />);
    expect(screen.getByRole("button", { name: /^\+1s$/i })).toBeDisabled();
  });

  it("keyboard: Enter activates the +1s button", async () => {
    setLivePaused(305);
    const user = userEvent.setup();
    render(<ClockAdjuster />);
    const plus = screen.getByRole("button", { name: /^\+1s$/i });
    plus.focus();
    await user.keyboard("{Enter}");
    expect(useGameStore.getState().clockSeconds).toBe(306);
  });

  it("tab order is digits → −1s → +1s", async () => {
    setLivePaused(305);
    const user = userEvent.setup();
    render(<ClockAdjuster />);
    const trigger = screen.getByRole("button", { name: /adjust clock/i });
    const minus = screen.getByRole("button", { name: /^−1s$/i });
    const plus = screen.getByRole("button", { name: /^\+1s$/i });
    trigger.focus();
    expect(trigger).toHaveFocus();
    await user.tab();
    expect(minus).toHaveFocus();
    await user.tab();
    expect(plus).toHaveFocus();
  });
});
