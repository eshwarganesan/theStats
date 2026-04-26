import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useGameStore } from "@/lib/store";
import { Scoreboard } from "./Scoreboard";
import { seedReadyGame } from "@/test/seed";
import { computeStats } from "@/lib/stats";
import { formatPeriod } from "@/lib/utils";

beforeEach(() => {
  useGameStore.getState().resetAll();
});

describe("Scoreboard", () => {
  it("renders both team names and tags", () => {
    seedReadyGame();
    useGameStore.getState().setTeam("home", { name: "Lakers", tag: "LAL" });
    useGameStore.getState().setTeam("away", { name: "Celtics", tag: "BOS" });
    render(<Scoreboard />);
    expect(screen.getByText("Lakers")).toBeInTheDocument();
    expect(screen.getByText("Celtics")).toBeInTheDocument();
    expect(screen.getByText("LAL")).toBeInTheDocument();
    expect(screen.getByText("BOS")).toBeInTheDocument();
  });

  it("displays scores derived from computeStats", () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    const home = useGameStore.getState();
    home.recordScore("home", players.homePlayer(0).id, "3pt", true);
    home.recordScore("away", players.awayPlayer(0).id, "2pt", true);

    render(<Scoreboard />);
    const stats = computeStats(
      useGameStore.getState().events,
      useGameStore.getState().homeTeam,
      useGameStore.getState().awayTeam,
      useGameStore.getState().settings,
      useGameStore.getState().currentPeriod,
    );
    expect(stats.home.points).toBe(3);
    expect(stats.away.points).toBe(2);
    expect(screen.getByText(String(stats.home.points))).toBeInTheDocument();
    expect(screen.getByText(String(stats.away.points))).toBeInTheDocument();
  });

  it("shows the possession indicator on the team that has the ball", () => {
    seedReadyGame();
    useGameStore.getState().togglePossession("home");
    render(<Scoreboard />);
    expect(screen.getByLabelText("In possession")).toBeInTheDocument();
  });

  it("renders the BONUS pill when team fouls reach the threshold", () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    const threshold = useGameStore.getState().settings.bonusFoulThreshold;
    // Mark threshold personal fouls on home in current period
    for (let i = 0; i < threshold; i++) {
      useGameStore
        .getState()
        .recordFoul("home", players.homePlayer(0).id, "personal");
    }
    render(<Scoreboard />);
    expect(screen.getByText("BONUS")).toBeInTheDocument();
  });

  it("uses formatPeriod for the period label", () => {
    seedReadyGame();
    useGameStore.getState().startGame();
    render(<Scoreboard />);
    expect(
      screen.getByText(formatPeriod(1, useGameStore.getState().settings.periods)),
    ).toBeInTheDocument();
  });

  it("renders 'Final' when the game is finished", () => {
    seedReadyGame();
    useGameStore.setState({ status: "finished" });
    render(<Scoreboard />);
    expect(screen.getByText("Final")).toBeInTheDocument();
  });

  it("renders 'Break' between periods", () => {
    seedReadyGame();
    useGameStore.setState({ status: "period-break" });
    render(<Scoreboard />);
    expect(screen.getByText("Break")).toBeInTheDocument();
  });
});
