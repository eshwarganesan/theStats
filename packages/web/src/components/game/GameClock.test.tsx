import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useGameStore } from "@/lib/store";
import { GameClock } from "./GameClock";
import { formatClock } from "@/lib/utils";

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
      clockSeconds: 30,
      clockRunning: false,
    });
    render(<GameClock />);
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
});
