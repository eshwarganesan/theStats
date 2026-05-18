import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useGameStore } from "@/lib/store";
import { DEFAULT_SETTINGS } from "@/lib/constants";
import SetupPage from "./page";

// next/navigation is used by SetupPage's Continue button; stub it for tests.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

beforeEach(() => {
  useGameStore.getState().resetAll();
});

describe("SetupPage — break duration inputs (feature 002)", () => {
  it("renders Timeout, Quarter break, and Halftime inputs pre-filled with 5v5 defaults", () => {
    render(<SetupPage />);
    const defaults = DEFAULT_SETTINGS["5v5"];

    const timeout = screen.getByLabelText(/Timeout \(sec\)/i) as HTMLInputElement;
    const quarter = screen.getByLabelText(/Quarter break \(sec\)/i) as HTMLInputElement;
    const halftime = screen.getByLabelText(/Halftime \(sec\)/i) as HTMLInputElement;

    expect(Number(timeout.value)).toBe(defaults.timeoutSeconds);
    expect(Number(quarter.value)).toBe(defaults.quarterBreakSeconds);
    expect(Number(halftime.value)).toBe(defaults.halftimeBreakSeconds);
  });

  it("editing Timeout dispatches setSettings with the new value", async () => {
    const user = userEvent.setup();
    render(<SetupPage />);
    const timeout = screen.getByLabelText(/Timeout \(sec\)/i);
    await user.clear(timeout);
    await user.type(timeout, "45");
    expect(useGameStore.getState().settings.timeoutSeconds).toBe(45);
  });

  it("editing Quarter break dispatches setSettings with the new value", async () => {
    const user = userEvent.setup();
    render(<SetupPage />);
    const quarter = screen.getByLabelText(/Quarter break \(sec\)/i);
    await user.clear(quarter);
    await user.type(quarter, "90");
    expect(useGameStore.getState().settings.quarterBreakSeconds).toBe(90);
  });

  it("editing Halftime dispatches setSettings with the new value", async () => {
    const user = userEvent.setup();
    render(<SetupPage />);
    const halftime = screen.getByLabelText(/Halftime \(sec\)/i);
    await user.clear(halftime);
    await user.type(halftime, "900");
    expect(useGameStore.getState().settings.halftimeBreakSeconds).toBe(900);
  });

  it("places the three new inputs inside the Game Settings section", () => {
    render(<SetupPage />);
    const section = screen.getByText(/Game Settings/i).closest("section");
    if (!section) throw new Error("Game Settings section not found");

    // The inputs should be descendants of the same <section>.
    expect(section.contains(screen.getByLabelText(/Timeout \(sec\)/i))).toBe(true);
    expect(section.contains(screen.getByLabelText(/Quarter break \(sec\)/i))).toBe(true);
    expect(section.contains(screen.getByLabelText(/Halftime \(sec\)/i))).toBe(true);
  });
});
