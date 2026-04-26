import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useGameStore } from "@/lib/store";
import { TeamPanel } from "./TeamPanel";
import { seedReadyGame } from "@/test/seed";

const noop = () => {};

beforeEach(() => {
  useGameStore.getState().resetAll();
});

describe("TeamPanel", () => {
  it("renders only on-court players, not bench players", () => {
    const players = seedReadyGame();
    useGameStore.getState().addPlayer("home", {
      number: "99",
      name: "Bench Player",
      isStarter: false,
      isCaptain: false,
    });
    render(
      <TeamPanel
        side="home"
        onPlayerTap={noop}
        onSubstitutionClick={noop}
        onTimeoutClick={noop}
        selectedPlayerId={null}
      />,
    );
    // 5 starter tiles render (number 1 through 5)
    for (let i = 1; i <= 5; i++) {
      expect(screen.getAllByText(String(i)).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText("99")).not.toBeInTheDocument();
    expect(screen.queryByText("Bench Player")).not.toBeInTheDocument();
    // 5 starters → 5 buttons in the grid
    const playerButtons = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-label")?.startsWith("Home "));
    expect(playerButtons).toHaveLength(5);
    // Implicitly assert player 0 by id
    expect(playerButtons[0]?.getAttribute("aria-label")).toContain(
      players.homePlayer(0).name,
    );
  });

  it("calls onPlayerTap with the player id when a tile is clicked", async () => {
    const players = seedReadyGame();
    const onPlayerTap = vi.fn();
    const user = userEvent.setup();
    render(
      <TeamPanel
        side="home"
        onPlayerTap={onPlayerTap}
        onSubstitutionClick={noop}
        onTimeoutClick={noop}
        selectedPlayerId={null}
      />,
    );
    await user.click(
      screen.getByLabelText(new RegExp(players.homePlayer(0).name)),
    );
    expect(onPlayerTap).toHaveBeenCalledWith(players.homePlayer(0).id);
  });

  it("renders foul count in danger color when at threshold-1", () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    // 4 personal fouls in 5v5 → warning color (threshold - 1)
    for (let i = 0; i < 4; i++) {
      useGameStore
        .getState()
        .recordFoul("home", players.homePlayer(0).id, "personal");
    }
    render(
      <TeamPanel
        side="home"
        onPlayerTap={noop}
        onSubstitutionClick={noop}
        onTimeoutClick={noop}
        selectedPlayerId={null}
      />,
    );
    const foulIndicator = screen.getByText("4F");
    expect(foulIndicator.className).toMatch(/text-danger/);
  });

  it("disables the Timeout button when timeoutsRemaining is 0", () => {
    seedReadyGame();
    useGameStore.getState().startGame();
    // Spend all 5 timeouts
    for (let i = 0; i < useGameStore.getState().settings.timeoutsPerGame; i++) {
      useGameStore.getState().recordTimeout("home");
    }
    render(
      <TeamPanel
        side="home"
        onPlayerTap={noop}
        onSubstitutionClick={noop}
        onTimeoutClick={noop}
        selectedPlayerId={null}
      />,
    );
    expect(screen.getByRole("button", { name: /Timeout \(0\)/ })).toBeDisabled();
  });

  it("calls onSubstitutionClick when Sub button is clicked", async () => {
    seedReadyGame();
    const onSub = vi.fn();
    const user = userEvent.setup();
    render(
      <TeamPanel
        side="home"
        onPlayerTap={noop}
        onSubstitutionClick={onSub}
        onTimeoutClick={noop}
        selectedPlayerId={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Sub" }));
    expect(onSub).toHaveBeenCalledOnce();
  });

  it("calls onTimeoutClick when Timeout button is clicked and not depleted", async () => {
    seedReadyGame();
    useGameStore.getState().startGame();
    const onTimeout = vi.fn();
    const user = userEvent.setup();
    render(
      <TeamPanel
        side="home"
        onPlayerTap={noop}
        onSubstitutionClick={noop}
        onTimeoutClick={onTimeout}
        selectedPlayerId={null}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Timeout \(\d+\)/ }));
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it("highlights the selected player tile", () => {
    const players = seedReadyGame();
    const sel = players.homePlayer(0).id;
    render(
      <TeamPanel
        side="home"
        onPlayerTap={noop}
        onSubstitutionClick={noop}
        onTimeoutClick={noop}
        selectedPlayerId={sel}
      />,
    );
    const tile = screen.getByLabelText(new RegExp(players.homePlayer(0).name));
    expect(tile).toHaveAttribute("aria-pressed", "true");
  });

  it("includes points and fouls in tile aria-label for screen readers", () => {
    const players = seedReadyGame();
    useGameStore.getState().startGame();
    useGameStore.getState().recordScore("home", players.homePlayer(0).id, "3pt", true);
    render(
      <TeamPanel
        side="home"
        onPlayerTap={noop}
        onSubstitutionClick={noop}
        onTimeoutClick={noop}
        selectedPlayerId={null}
      />,
    );
    const tile = screen.getByLabelText(/Home 1.*3 points.*0 fouls/);
    expect(tile).toBeInTheDocument();
  });
});
