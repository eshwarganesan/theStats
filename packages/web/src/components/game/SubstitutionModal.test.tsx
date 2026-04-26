import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useGameStore } from "@/lib/store";
import { SubstitutionModal } from "./SubstitutionModal";
import { seedReadyGame, addBench } from "@/test/seed";

beforeEach(() => {
  useGameStore.getState().resetAll();
});

describe("SubstitutionModal", () => {
  it("returns null when side is null", () => {
    seedReadyGame();
    const { container } = render(
      <SubstitutionModal open onClose={() => {}} side={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders on-court roster as OUT and bench as IN", () => {
    seedReadyGame();
    addBench("home", 1); // jersey 80
    render(<SubstitutionModal open onClose={() => {}} side="home" />);
    // 5 starters appear in OUT column
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByText(`Home ${i}`)).toBeInTheDocument();
    }
    // bench appears in IN column
    expect(screen.getByText("Bench 1")).toBeInTheDocument();
  });

  it("renders empty-state messages when columns are empty", () => {
    seedReadyGame(); // no bench
    render(<SubstitutionModal open onClose={() => {}} side="home" />);
    expect(screen.getByText(/No bench players available/)).toBeInTheDocument();
  });

  it("Confirm Swap is disabled until both columns have a selection", async () => {
    seedReadyGame();
    addBench("home", 1);
    const user = userEvent.setup();
    render(<SubstitutionModal open onClose={() => {}} side="home" />);
    const confirm = screen.getByRole("button", { name: /Confirm Swap/ });
    expect(confirm).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Home 1/ }));
    expect(confirm).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /Bench 1/ }));
    expect(confirm).not.toBeDisabled();
  });

  it("Confirm Swap calls substitute and closes", async () => {
    const players = seedReadyGame();
    addBench("home", 1);
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<SubstitutionModal open onClose={onClose} side="home" />);

    const out = players.homePlayer(0);
    const bench = useGameStore
      .getState()
      .homeTeam.roster.find((p) => p.name === "Bench 1")!;

    await user.click(screen.getByRole("button", { name: new RegExp(out.name) }));
    await user.click(screen.getByRole("button", { name: /Bench 1/ }));
    await user.click(screen.getByRole("button", { name: /Confirm Swap/ }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(useGameStore.getState().onCourt.home).toContain(bench.id);
    expect(useGameStore.getState().onCourt.home).not.toContain(out.id);
  });

  it("Cancel closes without substituting", async () => {
    seedReadyGame();
    addBench("home", 1);
    const onClose = vi.fn();
    const user = userEvent.setup();
    const before = useGameStore.getState().events.length;
    render(<SubstitutionModal open onClose={onClose} side="home" />);
    await user.click(screen.getByRole("button", { name: /Cancel/ }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(useGameStore.getState().events.length).toBe(before);
  });

  it("resets selection when reopened with a different side", async () => {
    seedReadyGame();
    addBench("home", 1);
    addBench("away", 1);

    const user = userEvent.setup();
    const { rerender } = render(
      <SubstitutionModal open onClose={() => {}} side="home" />,
    );
    await user.click(screen.getByRole("button", { name: /Home 1/ }));
    await user.click(screen.getByRole("button", { name: /Bench 1/ }));
    // Switch to away
    rerender(<SubstitutionModal open onClose={() => {}} side="away" />);
    // Confirm should be disabled again because selections were cleared
    expect(screen.getByRole("button", { name: /Confirm Swap/ })).toBeDisabled();
  });
});
