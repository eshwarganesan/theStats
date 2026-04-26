import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useGameStore } from "@/lib/store";
import { TeamSetupCard } from "./TeamSetupCard";

beforeEach(() => {
  useGameStore.getState().resetAll();
});

describe("TeamSetupCard — identity inputs", () => {
  it("updates team name via the input", async () => {
    const user = userEvent.setup();
    render(<TeamSetupCard side="home" />);
    const input = screen.getByLabelText("Team name");
    await user.clear(input);
    await user.type(input, "Lakers");
    expect(useGameStore.getState().homeTeam.name).toBe("Lakers");
  });

  it("upper-cases the tag input and clamps to 3 chars", async () => {
    const user = userEvent.setup();
    render(<TeamSetupCard side="home" />);
    const tag = screen.getByLabelText("Tag (3 letters)");
    await user.clear(tag);
    await user.type(tag, "lakers");
    expect(useGameStore.getState().homeTeam.tag).toBe("LAK");
  });

  it("updates head coach", async () => {
    const user = userEvent.setup();
    render(<TeamSetupCard side="home" />);
    const coach = screen.getByLabelText("Head coach");
    await user.type(coach, "Phil");
    expect(useGameStore.getState().homeTeam.coach).toBe("Phil");
  });

  it("displays the initial team color in hex", () => {
    render(<TeamSetupCard side="home" />);
    expect(
      screen.getByText(useGameStore.getState().homeTeam.color.toUpperCase()),
    ).toBeInTheDocument();
  });
});

describe("TeamSetupCard — roster", () => {
  it("renders the empty-state with a target count", () => {
    render(<TeamSetupCard side="home" />);
    expect(
      screen.getByText(/No players yet. Add at least 5/),
    ).toBeInTheDocument();
  });

  it("adding a player auto-flags as starter while under target", async () => {
    const user = userEvent.setup();
    render(<TeamSetupCard side="home" />);
    await user.type(screen.getByPlaceholderText("#"), "10");
    await user.type(screen.getByPlaceholderText("Player name"), "Tester");
    await user.click(screen.getByRole("button", { name: "Add" }));
    const roster = useGameStore.getState().homeTeam.roster;
    expect(roster).toHaveLength(1);
    expect(roster[0]!.isStarter).toBe(true);
  });

  it("rejects a duplicate jersey number silently", async () => {
    const user = userEvent.setup();
    render(<TeamSetupCard side="home" />);
    // Add #10
    await user.type(screen.getByPlaceholderText("#"), "10");
    await user.type(screen.getByPlaceholderText("Player name"), "First");
    await user.click(screen.getByRole("button", { name: "Add" }));
    // Try to add another #10
    await user.type(screen.getByPlaceholderText("#"), "10");
    await user.type(screen.getByPlaceholderText("Player name"), "Second");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(useGameStore.getState().homeTeam.roster).toHaveLength(1);
  });

  it("Add button is disabled until both fields are filled", () => {
    render(<TeamSetupCard side="home" />);
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("starter checkbox is disabled for new candidates once at target", async () => {
    const user = userEvent.setup();
    render(<TeamSetupCard side="home" />);
    // Add 5 starters
    for (let i = 1; i <= 5; i++) {
      await user.type(screen.getByPlaceholderText("#"), String(i));
      await user.type(screen.getByPlaceholderText("Player name"), `P${i}`);
      await user.click(screen.getByRole("button", { name: "Add" }));
    }
    // 6th player should be added but as non-starter; verify checkbox is unchecked + disabled
    await user.type(screen.getByPlaceholderText("#"), "6");
    await user.type(screen.getByPlaceholderText("Player name"), "P6");
    await user.click(screen.getByRole("button", { name: "Add" }));

    const roster = useGameStore.getState().homeTeam.roster;
    expect(roster).toHaveLength(6);
    const sixth = roster.find((p) => p.number === "6")!;
    expect(sixth.isStarter).toBe(false);

    // Find the starter checkbox for P6
    const checkboxes = screen.getAllByRole("checkbox");
    const sixthRow = screen.getByDisplayValue("6").closest("li")!;
    const sixthStarter = sixthRow.querySelectorAll("input[type=checkbox]")[0] as HTMLInputElement;
    expect(sixthStarter.checked).toBe(false);
    expect(sixthStarter.disabled).toBe(true);
    expect(checkboxes.length).toBeGreaterThanOrEqual(12); // 6 players × 2 checkboxes
  });

  it("inline edit propagates to the store via updatePlayer", async () => {
    const user = userEvent.setup();
    render(<TeamSetupCard side="home" />);
    await user.type(screen.getByPlaceholderText("#"), "10");
    await user.type(screen.getByPlaceholderText("Player name"), "Tester");
    await user.click(screen.getByRole("button", { name: "Add" }));

    const nameInput = screen.getByDisplayValue("Tester");
    await user.clear(nameInput);
    await user.type(nameInput, "NewName");
    expect(useGameStore.getState().homeTeam.roster[0]!.name).toBe("NewName");
  });

  it("toggling captain checkbox flips isCaptain", async () => {
    const user = userEvent.setup();
    render(<TeamSetupCard side="home" />);
    await user.type(screen.getByPlaceholderText("#"), "10");
    await user.type(screen.getByPlaceholderText("Player name"), "Tester");
    await user.click(screen.getByRole("button", { name: "Add" }));

    const row = screen.getByDisplayValue("10").closest("li")!;
    // 0 = starter, 1 = captain in column order
    const captain = row.querySelectorAll("input[type=checkbox]")[1] as HTMLInputElement;
    await user.click(captain);
    expect(useGameStore.getState().homeTeam.roster[0]!.isCaptain).toBe(true);
  });

  it("remove button drops the player", async () => {
    const user = userEvent.setup();
    render(<TeamSetupCard side="home" />);
    await user.type(screen.getByPlaceholderText("#"), "10");
    await user.type(screen.getByPlaceholderText("Player name"), "Tester");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await user.click(screen.getByRole("button", { name: /Remove Tester/ }));
    expect(useGameStore.getState().homeTeam.roster).toHaveLength(0);
  });

  it("starter count badge turns success when target is reached", async () => {
    const user = userEvent.setup();
    render(<TeamSetupCard side="home" />);
    expect(screen.getByText("0/5").className).toMatch(/text-warning/);
    for (let i = 1; i <= 5; i++) {
      await user.type(screen.getByPlaceholderText("#"), String(i));
      await user.type(screen.getByPlaceholderText("Player name"), `P${i}`);
      await user.click(screen.getByRole("button", { name: "Add" }));
    }
    expect(screen.getByText("5/5").className).toMatch(/text-success/);
  });

  it("home and away cards render with side-specific badges", () => {
    const { rerender } = render(<TeamSetupCard side="home" />);
    expect(screen.getByText("home")).toBeInTheDocument();
    rerender(<TeamSetupCard side="away" />);
    expect(screen.getByText("away")).toBeInTheDocument();
  });
});
