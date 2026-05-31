import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useGameStore } from "@/lib/store";
import { GameClock } from "./GameClock";
import { formatClock } from "@thestats/core";

beforeEach(() => {
  useGameStore.getState().resetAll();
});

describe("GameClock", () => {
  it("renders the formatted clock value", () => {
    useGameStore.setState({ clockSeconds: 305 });
    render(<GameClock />);
    expect(screen.getByText(formatClock(305))).toBeInTheDocument();
  });

  it("uses the critical (accent) class under 60s when live", () => {
    useGameStore.setState({
      status: "live",
      clockSeconds: 30,
      clockRunning: true,
    });
    render(<GameClock />);
    const node = screen.getByText(formatClock(30));
    expect(node.className).toMatch(/text-accent/);
  });

  it("does not use critical class when clock is at zero (game over feel)", () => {
    useGameStore.setState({
      status: "live",
      clockSeconds: 0,
      clockRunning: false,
    });
    render(<GameClock />);
    const node = screen.getByText(formatClock(0));
    expect(node.className).not.toMatch(/text-accent/);
  });

  it("uses muted text color when paused above 60s", () => {
    useGameStore.setState({
      status: "live",
      clockSeconds: 300,
      clockRunning: false,
    });
    render(<GameClock />);
    const node = screen.getByText(formatClock(300));
    expect(node.className).toMatch(/text-ink-muted/);
  });

  it("uses bright ink when running above 60s", () => {
    useGameStore.setState({
      status: "live",
      clockSeconds: 300,
      clockRunning: true,
    });
    render(<GameClock />);
    const node = screen.getByText(formatClock(300));
    expect(node.className).toMatch(/text-ink/);
    expect(node.className).not.toMatch(/text-accent/);
  });

  it("does not apply critical color when status is not live", () => {
    useGameStore.setState({
      status: "period-break",
      clockSeconds: 600,
      clockRunning: false,
      breakSeconds: 30,
    });
    render(<GameClock />);
    // During period-break the display reads breakSeconds, not clockSeconds.
    expect(screen.getByText(formatClock(30)).className).not.toMatch(/text-accent/);
  });

  it("renders no interactive controls (display-only)", () => {
    useGameStore.setState({
      status: "live",
      clockSeconds: 305,
      clockRunning: false,
    });
    render(<GameClock />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("displays breakSeconds (not clockSeconds) when status is 'timeout' (feature 002)", () => {
    useGameStore.setState({
      status: "timeout",
      clockSeconds: 420,
      clockRunning: false,
      breakSeconds: 45,
    });
    render(<GameClock />);
    expect(screen.getByText(formatClock(45))).toBeInTheDocument();
    expect(screen.queryByText(formatClock(420))).toBeNull();
  });

  it("displays breakSeconds (not clockSeconds) when status is 'period-break' (feature 002)", () => {
    useGameStore.setState({
      status: "period-break",
      clockSeconds: 420,
      clockRunning: false,
      breakSeconds: 120,
    });
    render(<GameClock />);
    expect(screen.getByText(formatClock(120))).toBeInTheDocument();
    expect(screen.queryByText(formatClock(420))).toBeNull();
  });

  it("returns to clockSeconds display once status leaves a break state", () => {
    const { rerender } = render(<GameClock />);
    useGameStore.setState({
      status: "timeout",
      clockSeconds: 420,
      breakSeconds: 30,
    });
    rerender(<GameClock />);
    expect(screen.getByText(formatClock(30))).toBeInTheDocument();

    useGameStore.setState({
      status: "live",
      clockSeconds: 420,
      breakSeconds: 0,
    });
    rerender(<GameClock />);
    expect(screen.getByText(formatClock(420))).toBeInTheDocument();
  });

  it("falls back to clockSeconds when status is 'timeout' but breakSeconds is 0 (zero-configured timeout)", () => {
    useGameStore.setState({
      status: "timeout",
      clockSeconds: 420,
      clockRunning: false,
      breakSeconds: 0,
    });
    render(<GameClock />);
    expect(screen.getByText(formatClock(420))).toBeInTheDocument();
  });

  it("falls back to clockSeconds when status is 'period-break' but breakSeconds is 0 (zero-configured break)", () => {
    useGameStore.setState({
      status: "period-break",
      clockSeconds: 420,
      clockRunning: false,
      breakSeconds: 0,
    });
    render(<GameClock />);
    expect(screen.getByText(formatClock(420))).toBeInTheDocument();
  });

  it("flips from breakSeconds back to clockSeconds when a running countdown ticks down to 0", () => {
    const { rerender } = render(<GameClock />);
    useGameStore.setState({
      status: "timeout",
      clockSeconds: 420,
      clockRunning: false,
      breakSeconds: 5,
    });
    rerender(<GameClock />);
    expect(screen.getByText(formatClock(5))).toBeInTheDocument();

    // Tick to 0 while still in timeout state — display should fall back.
    useGameStore.setState({
      status: "timeout",
      clockSeconds: 420,
      clockRunning: false,
      breakSeconds: 0,
    });
    rerender(<GameClock />);
    expect(screen.getByText(formatClock(420))).toBeInTheDocument();
  });
});
