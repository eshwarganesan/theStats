import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useGameStore } from "@/lib/store";
import { DEFAULT_SETTINGS } from "@thestats/core";
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

describe("SetupPage — overtime length input + toggle (feature 003)", () => {
  it("renders Overtime length (min) pre-filled with 5v5 default (5)", () => {
    render(<SetupPage />);
    const ot = screen.getByLabelText(/Overtime length \(min\)/i) as HTMLInputElement;
    expect(Number(ot.value)).toBe(
      Math.round(DEFAULT_SETTINGS["5v5"].overtimeSeconds / 60),
    );
  });

  it("editing Overtime length dispatches setSettings({ overtimeSeconds: <minutes * 60> })", async () => {
    const user = userEvent.setup();
    render(<SetupPage />);
    const ot = screen.getByLabelText(/Overtime length \(min\)/i);
    await user.clear(ot);
    await user.type(ot, "7");
    expect(useGameStore.getState().settings.overtimeSeconds).toBe(7 * 60);
  });

  it("places the Overtime length input inside the Game Settings section", () => {
    render(<SetupPage />);
    const section = screen.getByText(/Game Settings/i).closest("section");
    if (!section) throw new Error("Game Settings section not found");
    expect(section.contains(screen.getByLabelText(/Overtime length \(min\)/i))).toBe(true);
  });

  it("renders Overtime On/Off toggle with On active for 5v5 default", () => {
    render(<SetupPage />);
    const on = screen.getByRole("button", { name: /^On$/ });
    const off = screen.getByRole("button", { name: /^Off$/ });
    expect(on).toHaveAttribute("aria-pressed", "true");
    expect(off).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking Off dispatches setSettings({ overtimeEnabled: false })", async () => {
    const user = userEvent.setup();
    render(<SetupPage />);
    await user.click(screen.getByRole("button", { name: /^Off$/ }));
    expect(useGameStore.getState().settings.overtimeEnabled).toBe(false);
  });

  it("clicking On (after Off) dispatches setSettings({ overtimeEnabled: true })", async () => {
    const user = userEvent.setup();
    render(<SetupPage />);
    await user.click(screen.getByRole("button", { name: /^Off$/ }));
    await user.click(screen.getByRole("button", { name: /^On$/ }));
    expect(useGameStore.getState().settings.overtimeEnabled).toBe(true);
  });

  it("places the Overtime toggle inside the Game Settings section", () => {
    render(<SetupPage />);
    const section = screen.getByText(/Game Settings/i).closest("section");
    if (!section) throw new Error("Game Settings section not found");
    expect(section.contains(screen.getByRole("button", { name: /^On$/ }))).toBe(true);
    expect(section.contains(screen.getByRole("button", { name: /^Off$/ }))).toBe(true);
  });
});

describe("SetupPage — possession arrow toggle (feature 007)", () => {
  it("renders Possession arrow On/Off toggle with On active for 5v5 default", () => {
    render(<SetupPage />);
    const on = screen.getByRole("button", { name: /^Possession arrow On$/ });
    const off = screen.getByRole("button", { name: /^Possession arrow Off$/ });
    expect(on).toHaveAttribute("aria-pressed", "true");
    expect(off).toHaveAttribute("aria-pressed", "false");
  });

  it("flips to Off active when format is switched to 3v3 (cascade)", async () => {
    const user = userEvent.setup();
    render(<SetupPage />);
    await user.click(screen.getByRole("button", { name: /^3v3$/ }));
    const on = screen.getByRole("button", { name: /^Possession arrow On$/ });
    const off = screen.getByRole("button", { name: /^Possession arrow Off$/ });
    expect(off).toHaveAttribute("aria-pressed", "true");
    expect(on).toHaveAttribute("aria-pressed", "false");
    expect(useGameStore.getState().settings.possessionArrowEnabled).toBe(false);
  });

  it("clicking Off in 5v5 dispatches setSettings({ possessionArrowEnabled: false })", async () => {
    const user = userEvent.setup();
    render(<SetupPage />);
    await user.click(screen.getByRole("button", { name: /^Possession arrow Off$/ }));
    expect(useGameStore.getState().settings.possessionArrowEnabled).toBe(false);
  });

  it("clicking On (after Off) dispatches setSettings({ possessionArrowEnabled: true })", async () => {
    const user = userEvent.setup();
    render(<SetupPage />);
    await user.click(screen.getByRole("button", { name: /^Possession arrow Off$/ }));
    await user.click(screen.getByRole("button", { name: /^Possession arrow On$/ }));
    expect(useGameStore.getState().settings.possessionArrowEnabled).toBe(true);
  });

  it("format cascade restores the default (5v5 → 3v3 → 5v5 returns toggle to On)", async () => {
    const user = userEvent.setup();
    render(<SetupPage />);
    // Flip off in 5v5
    await user.click(screen.getByRole("button", { name: /^Possession arrow Off$/ }));
    expect(useGameStore.getState().settings.possessionArrowEnabled).toBe(false);
    // Cascade to 3v3 (already off by default)
    await user.click(screen.getByRole("button", { name: /^3v3$/ }));
    expect(useGameStore.getState().settings.possessionArrowEnabled).toBe(false);
    // Cascade back to 5v5 (default on)
    await user.click(screen.getByRole("button", { name: /^5v5$/ }));
    expect(useGameStore.getState().settings.possessionArrowEnabled).toBe(true);
  });

  it("places the Possession arrow toggle inside the Game Settings section", () => {
    render(<SetupPage />);
    const section = screen.getByText(/Game Settings/i).closest("section");
    if (!section) throw new Error("Game Settings section not found");
    expect(
      section.contains(
        screen.getByRole("button", { name: /^Possession arrow On$/ }),
      ),
    ).toBe(true);
    expect(
      section.contains(
        screen.getByRole("button", { name: /^Possession arrow Off$/ }),
      ),
    ).toBe(true);
  });
});
