import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useGameStore } from "@/lib/store";
import { computeStats } from "@thestats/core";
import { TeamActionsModal } from "./TeamActionsModal";
import { seedReadyGame } from "@/test/seed";

beforeEach(() => {
  useGameStore.getState().resetAll();
});

const get = () => useGameStore.getState();
const stats = () =>
  computeStats(get().events, get().homeTeam, get().awayTeam, get().settings, get().currentPeriod);

describe("TeamActionsModal", () => {
  it("returns null when side is null", () => {
    seedReadyGame();
    const { container } = render(
      <TeamActionsModal open onClose={() => {}} side={null} capturedClockAt={null} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders a button per violation kind", () => {
    seedReadyGame();
    get().startGame();
    render(
      <TeamActionsModal open onClose={() => {}} side="home" capturedClockAt={null} />,
    );
    expect(screen.getByRole("button", { name: /8-Second Violation/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /24-Second Violation/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /3-Second Violation/ })).toBeInTheDocument();
  });

  it("records a team turnover and closes when a violation is tapped", async () => {
    seedReadyGame();
    get().startGame();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <TeamActionsModal open onClose={onClose} side="home" capturedClockAt={200} />,
    );
    await user.click(screen.getByRole("button", { name: /24-Second Violation/ }));
    expect(stats().home.teamTurnovers).toBe(1);
    const last = get().events.at(-1);
    if (last?.type === "team-turnover") {
      expect(last.kind).toBe("24-second");
      expect(last.clockAt).toBe(200);
    }
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("disables the violation buttons before the game is live (ready state)", () => {
    seedReadyGame(); // status = ready
    render(
      <TeamActionsModal open onClose={() => {}} side="home" capturedClockAt={null} />,
    );
    expect(screen.getByRole("button", { name: /24-Second Violation/ })).toBeDisabled();
  });

  it("keeps Add points disabled until a positive whole number is entered", async () => {
    seedReadyGame();
    const user = userEvent.setup();
    render(
      <TeamActionsModal open onClose={() => {}} side="home" capturedClockAt={null} />,
    );
    const confirm = screen.getByRole("button", { name: /Add points/ });
    const input = screen.getByLabelText("Points to add");
    expect(confirm).toBeDisabled();

    await user.type(input, "0");
    expect(confirm).toBeDisabled();

    await user.clear(input);
    await user.type(input, "-3");
    expect(confirm).toBeDisabled();

    await user.clear(input);
    await user.type(input, "2.5");
    expect(confirm).toBeDisabled();

    await user.clear(input);
    await user.type(input, "5");
    expect(confirm).toBeEnabled();
  });

  it("adds a positive award (available from ready) and closes", async () => {
    seedReadyGame(); // ready, pre-tip
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <TeamActionsModal open onClose={onClose} side="home" capturedClockAt={null} />,
    );
    await user.type(screen.getByLabelText("Points to add"), "5");
    await user.type(screen.getByLabelText("Reason"), "missing jersey");
    await user.click(screen.getByRole("button", { name: /Add points/ }));
    expect(stats().home.points).toBe(5);
    const last = get().events.at(-1);
    if (last?.type === "team-score-adjust") expect(last.reason).toBe("missing jersey");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("makes no store mutation when closed without confirming", async () => {
    seedReadyGame();
    get().startGame();
    const before = get().events.length;
    const user = userEvent.setup();
    render(
      <TeamActionsModal open onClose={() => {}} side="home" capturedClockAt={null} />,
    );
    await user.type(screen.getByLabelText("Points to add"), "5");
    // No confirm click → no event recorded
    expect(get().events.length).toBe(before);
  });
});
