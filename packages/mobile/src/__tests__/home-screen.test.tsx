import { render, screen } from "@testing-library/react-native";

import { useGameStore } from "@/lib/store";

import HomeScreen from "@/app/index";

beforeEach(() => {
  useGameStore.getState().resetAll();
});

describe("<HomeScreen />", () => {
  it("shows the matchup and status from the shared store", async () => {
    useGameStore.getState().setTeam("home", { name: "Central High" });
    useGameStore.getState().setTeam("away", { name: "Eastridge" });
    await render(<HomeScreen />);

    expect(screen.getByText("Central High")).toBeOnTheScreen();
    expect(screen.getByText("Eastridge")).toBeOnTheScreen();
    expect(screen.getByText("Not started")).toBeOnTheScreen();
    expect(screen.getAllByText("0")).toHaveLength(2);
  });

  it("derives the score from recorded events via @thestats/core", async () => {
    useGameStore
      .getState()
      .addPlayer("home", { number: "23", name: "Jordan", isStarter: true, isCaptain: false });
    const shooter = useGameStore.getState().homeTeam.roster[0];
    if (!shooter) throw new Error("expected a rostered player");
    useGameStore.getState().recordScore("home", shooter.id, "3pt", true);
    await render(<HomeScreen />);

    expect(screen.getByText("3")).toBeOnTheScreen();
  });
});
