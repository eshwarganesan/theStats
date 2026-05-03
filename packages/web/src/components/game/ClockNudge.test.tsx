import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useGameStore } from "@/lib/store";
import { ClockNudge } from "./ClockNudge";

beforeEach(() => {
  useGameStore.getState().resetAll();
});

function setLivePaused(clockSeconds: number) {
  useGameStore.setState({
    status: "live",
    clockSeconds,
    clockRunning: false,
  });
}

describe("ClockNudge — seconds variant (stepSeconds=1, unitLabel='s')", () => {
  it("+1s increments clockSeconds and records one event", async () => {
    setLivePaused(305);
    const beforeEvents = useGameStore.getState().events.length;
    const user = userEvent.setup();
    render(<ClockNudge stepSeconds={1} unitLabel="s" />);
    await user.click(screen.getByRole("button", { name: /^\+1s$/i }));
    expect(useGameStore.getState().clockSeconds).toBe(306);
    expect(useGameStore.getState().events.length).toBe(beforeEvents + 1);
  });

  it("−1s decrements clockSeconds", async () => {
    setLivePaused(305);
    const user = userEvent.setup();
    render(<ClockNudge stepSeconds={1} unitLabel="s" />);
    await user.click(screen.getByRole("button", { name: /^−1s$/i }));
    expect(useGameStore.getState().clockSeconds).toBe(304);
  });

  it("five rapid +1s taps produce a single coalesced event with from→to bracketing the session", () => {
    setLivePaused(305);
    const beforeEvents = useGameStore.getState().events.length;
    render(<ClockNudge stepSeconds={1} unitLabel="s" />);
    const plus = screen.getByRole("button", { name: /^\+1s$/i });
    for (let i = 0; i < 5; i++) plus.click();
    expect(useGameStore.getState().clockSeconds).toBe(310);
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
    const { rerender } = render(<ClockNudge stepSeconds={1} unitLabel="s" />);
    expect(screen.getByRole("button", { name: /^−1s$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^\+1s$/i })).not.toBeDisabled();

    setLivePaused(useGameStore.getState().settings.periodSeconds);
    rerender(<ClockNudge stepSeconds={1} unitLabel="s" />);
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
    render(<ClockNudge stepSeconds={1} unitLabel="s" />);
    expect(screen.getByRole("button", { name: /^\+1s$/i })).toBeDisabled();
  });

  it("Enter activates the +1s button", async () => {
    setLivePaused(305);
    const user = userEvent.setup();
    render(<ClockNudge stepSeconds={1} unitLabel="s" />);
    const plus = screen.getByRole("button", { name: /^\+1s$/i });
    plus.focus();
    await user.keyboard("{Enter}");
    expect(useGameStore.getState().clockSeconds).toBe(306);
  });

  it("DOM order is −1s before +1s so tab order reads naturally", async () => {
    setLivePaused(305);
    const user = userEvent.setup();
    render(<ClockNudge stepSeconds={1} unitLabel="s" />);
    const minus = screen.getByRole("button", { name: /^−1s$/i });
    const plus = screen.getByRole("button", { name: /^\+1s$/i });
    minus.focus();
    expect(minus).toHaveFocus();
    await user.tab();
    expect(plus).toHaveFocus();
  });
});

describe("ClockNudge — minutes variant (stepSeconds=60, unitLabel='m')", () => {
  it("+1m increments clockSeconds by 60 and records one event", async () => {
    setLivePaused(305);
    const beforeEvents = useGameStore.getState().events.length;
    const user = userEvent.setup();
    render(<ClockNudge stepSeconds={60} unitLabel="m" />);
    await user.click(screen.getByRole("button", { name: /^\+1m$/i }));
    expect(useGameStore.getState().clockSeconds).toBe(365);
    expect(useGameStore.getState().events.length).toBe(beforeEvents + 1);
  });

  it("−1m decrements clockSeconds by 60", async () => {
    setLivePaused(305);
    const user = userEvent.setup();
    render(<ClockNudge stepSeconds={60} unitLabel="m" />);
    await user.click(screen.getByRole("button", { name: /^−1m$/i }));
    expect(useGameStore.getState().clockSeconds).toBe(245);
  });

  it("disables −1m when fewer than 60 seconds remain", () => {
    setLivePaused(45);
    render(<ClockNudge stepSeconds={60} unitLabel="m" />);
    expect(screen.getByRole("button", { name: /^−1m$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^\+1m$/i })).not.toBeDisabled();
  });

  it("disables −1m at exactly 59s but enables it at exactly 60s", () => {
    setLivePaused(59);
    const { rerender } = render(<ClockNudge stepSeconds={60} unitLabel="m" />);
    expect(screen.getByRole("button", { name: /^−1m$/i })).toBeDisabled();

    setLivePaused(60);
    rerender(<ClockNudge stepSeconds={60} unitLabel="m" />);
    expect(screen.getByRole("button", { name: /^−1m$/i })).not.toBeDisabled();
  });

  it("disables +1m when adding 60s would overshoot the period max", () => {
    const periodSeconds = useGameStore.getState().settings.periodSeconds;
    setLivePaused(periodSeconds - 30);
    render(<ClockNudge stepSeconds={60} unitLabel="m" />);
    expect(screen.getByRole("button", { name: /^\+1m$/i })).toBeDisabled();
  });

  it("enables +1m when there is exactly room for a full minute", () => {
    const periodSeconds = useGameStore.getState().settings.periodSeconds;
    setLivePaused(periodSeconds - 60);
    render(<ClockNudge stepSeconds={60} unitLabel="m" />);
    expect(screen.getByRole("button", { name: /^\+1m$/i })).not.toBeDisabled();
  });

  it("uses overtimeSeconds as the +1m ceiling during overtime", () => {
    const ot = useGameStore.getState().settings.overtimeSeconds;
    useGameStore.setState({
      status: "live",
      clockRunning: false,
      currentPeriod: useGameStore.getState().settings.periods + 1,
      clockSeconds: ot - 30,
    });
    render(<ClockNudge stepSeconds={60} unitLabel="m" />);
    expect(screen.getByRole("button", { name: /^\+1m$/i })).toBeDisabled();
  });
});
