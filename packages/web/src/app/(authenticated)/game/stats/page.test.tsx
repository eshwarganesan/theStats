import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { useGameStore } from "@/lib/store";
import { seedReadyGame } from "@/test/seed";
import StatsPage from "./page";

beforeEach(() => {
  useGameStore.getState().resetAll();
});

describe("StatsPage — OREB / DREB / REB columns", () => {
  it("renders OREB, DREB and REB column headers in both team box scores", () => {
    seedReadyGame();
    useGameStore.getState().startGame();
    render(<StatsPage />);

    expect(screen.getAllByRole("columnheader", { name: "OREB" })).toHaveLength(2);
    expect(screen.getAllByRole("columnheader", { name: "DREB" })).toHaveLength(2);
    expect(screen.getAllByRole("columnheader", { name: "REB" })).toHaveLength(2);
  });

  it("renders per-player OREB/DREB/REB values from the event log", () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    const target = players.homePlayer(0);
    useGameStore.getState().recordStat("home", target.id, "rebound-off");
    useGameStore.getState().recordStat("home", target.id, "rebound-off");
    useGameStore.getState().recordStat("home", target.id, "rebound-def");

    render(<StatsPage />);

    const row = screen.getByText(target.name).closest("tr");
    if (!row) throw new Error("player row not found");
    const cells = within(row).getAllByRole("cell");
    // Row order: #, Player, PTS, FG, 3P, FT, OREB, DREB, REB, AST, STL, BLK, TO, PF
    expect(cells[6]).toHaveTextContent("2");
    expect(cells[7]).toHaveTextContent("1");
    expect(cells[8]).toHaveTextContent("3");
  });

  it("aggregates OREB/DREB/REB totals across the team in the footer", () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().recordStat("home", players.homePlayer(0).id, "rebound-off");
    useGameStore.getState().recordStat("home", players.homePlayer(1).id, "rebound-off");
    useGameStore.getState().recordStat("home", players.homePlayer(2).id, "rebound-def");
    useGameStore.getState().recordStat("home", players.homePlayer(3).id, "rebound-def");
    useGameStore.getState().recordStat("home", players.homePlayer(4).id, "rebound-def");

    render(<StatsPage />);

    const totalRow = screen.getAllByText("Total")[0]?.closest("tr");
    if (!totalRow) throw new Error("home totals row not found");
    const cells = within(totalRow).getAllByRole("cell");
    expect(cells[6]).toHaveTextContent("2");
    expect(cells[7]).toHaveTextContent("3");
    expect(cells[8]).toHaveTextContent("5");
  });
});
