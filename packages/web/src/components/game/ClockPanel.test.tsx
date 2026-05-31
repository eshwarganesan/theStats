import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useGameStore } from "@/lib/store";
import { ClockPanel } from "./ClockPanel";
import { formatClock } from "@thestats/core";

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

describe("ClockPanel — visibility gating", () => {
  it("renders only the formatted display when status is setup", () => {
    useGameStore.setState({ status: "setup", clockSeconds: 305 });
    render(<ClockPanel />);
    expect(screen.getByText(formatClock(305))).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("renders only the formatted display when status is finished", () => {
    useGameStore.setState({ status: "finished", clockSeconds: 305 });
    render(<ClockPanel />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders only the formatted display when the clock is running", () => {
    useGameStore.setState({
      status: "live",
      clockSeconds: 305,
      clockRunning: true,
    });
    render(<ClockPanel />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders editor, minute nudges, and second nudges when live and paused", () => {
    setLivePaused(305);
    render(<ClockPanel />);
    expect(screen.getByRole("button", { name: /adjust clock/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^−1m$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^\+1m$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^−1s$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^\+1s$/i })).toBeInTheDocument();
  });
});

describe("ClockPanel — integration", () => {
  it("nudging via +1s updates the rendered display", async () => {
    setLivePaused(305);
    const user = userEvent.setup();
    render(<ClockPanel />);
    await user.click(screen.getByRole("button", { name: /^\+1s$/i }));
    expect(screen.getByText(formatClock(306))).toBeInTheDocument();
  });

  it("nudging via +1m updates the rendered display by 60 seconds", async () => {
    setLivePaused(305);
    const user = userEvent.setup();
    render(<ClockPanel />);
    await user.click(screen.getByRole("button", { name: /^\+1m$/i }));
    expect(screen.getByText(formatClock(365))).toBeInTheDocument();
  });

  it("tab order is −1m → +1m → digits → −1s → +1s", async () => {
    setLivePaused(305);
    const user = userEvent.setup();
    render(<ClockPanel />);
    const minusM = screen.getByRole("button", { name: /^−1m$/i });
    const plusM = screen.getByRole("button", { name: /^\+1m$/i });
    const trigger = screen.getByRole("button", { name: /adjust clock/i });
    const minusS = screen.getByRole("button", { name: /^−1s$/i });
    const plusS = screen.getByRole("button", { name: /^\+1s$/i });
    minusM.focus();
    expect(minusM).toHaveFocus();
    await user.tab();
    expect(plusM).toHaveFocus();
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.tab();
    expect(minusS).toHaveFocus();
    await user.tab();
    expect(plusS).toHaveFocus();
  });
});

describe("ClockPanel — break states are read-only (feature 002)", () => {
  it("renders only the read-only countdown display during status==='timeout' — no editor, no nudges", () => {
    useGameStore.setState({
      status: "timeout",
      clockSeconds: 305,
      clockRunning: false,
      breakSeconds: 60,
    });
    render(<ClockPanel />);
    // Countdown is visible (sourced from breakSeconds, not clockSeconds).
    expect(screen.getByText(formatClock(60))).toBeInTheDocument();
    // No interactive controls.
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("renders only the read-only countdown display during status==='period-break' — no editor, no nudges", () => {
    useGameStore.setState({
      status: "period-break",
      clockSeconds: 305,
      clockRunning: false,
      breakSeconds: 120,
    });
    render(<ClockPanel />);
    expect(screen.getByText(formatClock(120))).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
