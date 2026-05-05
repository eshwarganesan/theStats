import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useGameStore } from "@/lib/store";
import { ClockEditor } from "./ClockEditor";
import { formatClock } from "@/lib/utils";

beforeEach(() => {
  useGameStore.getState().resetAll();
});

/**
 * Helper: drive the store to a live + paused state with a known clock value.
 * `ClockEditor` itself doesn't gate on status (its parent does), but tests
 * mirror the realistic mounted state.
 */
function setLivePaused(clockSeconds: number) {
  useGameStore.setState({
    status: "live",
    clockSeconds,
    clockRunning: false,
  });
}

describe("ClockEditor — trigger", () => {
  it("renders an 'Adjust clock time' button wrapping the formatted display", () => {
    setLivePaused(305);
    render(<ClockEditor />);
    expect(screen.getByRole("button", { name: /adjust clock/i })).toBeInTheDocument();
    expect(screen.getByText(formatClock(305))).toBeInTheDocument();
  });

  it("tapping the trigger surfaces an mm:ss input pre-filled with the current value", async () => {
    setLivePaused(462);
    const user = userEvent.setup();
    render(<ClockEditor />);
    await user.click(screen.getByRole("button", { name: /adjust clock/i }));
    const input = screen.getByRole("textbox", { name: /clock time, minutes and seconds/i });
    expect(input).toHaveValue("07:42");
    expect(input).toHaveFocus();
  });
});

describe("ClockEditor — commit", () => {
  it("commits a valid typed entry on Enter and updates clockSeconds", async () => {
    setLivePaused(462);
    const user = userEvent.setup();
    render(<ClockEditor />);
    await user.click(screen.getByRole("button", { name: /adjust clock/i }));
    const input = screen.getByRole("textbox", { name: /clock time, minutes and seconds/i });
    await user.clear(input);
    await user.type(input, "5:00{enter}");
    expect(useGameStore.getState().clockSeconds).toBe(300);
  });

  it("commits a valid typed entry on blur", async () => {
    setLivePaused(462);
    const user = userEvent.setup();
    render(
      <>
        <ClockEditor />
        <button>elsewhere</button>
      </>,
    );
    await user.click(screen.getByRole("button", { name: /adjust clock/i }));
    const input = screen.getByRole("textbox", { name: /clock time, minutes and seconds/i });
    await user.clear(input);
    await user.type(input, "3:30");
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(useGameStore.getState().clockSeconds).toBe(210);
  });

  it("invalid typed entry preserves the prior value and emits no event", async () => {
    setLivePaused(462);
    const beforeEvents = useGameStore.getState().events.length;
    const user = userEvent.setup();
    render(<ClockEditor />);
    await user.click(screen.getByRole("button", { name: /adjust clock/i }));
    const input = screen.getByRole("textbox", { name: /clock time, minutes and seconds/i });
    await user.clear(input);
    await user.type(input, "abc{enter}");
    expect(useGameStore.getState().clockSeconds).toBe(462);
    expect(useGameStore.getState().events.length).toBe(beforeEvents);
  });

  it("Escape discards an in-progress edit", async () => {
    setLivePaused(462);
    const beforeEvents = useGameStore.getState().events.length;
    const user = userEvent.setup();
    render(<ClockEditor />);
    await user.click(screen.getByRole("button", { name: /adjust clock/i }));
    const input = screen.getByRole("textbox", { name: /clock time, minutes and seconds/i });
    await user.clear(input);
    await user.type(input, "9:99");
    await user.keyboard("{Escape}");
    expect(useGameStore.getState().clockSeconds).toBe(462);
    expect(useGameStore.getState().events.length).toBe(beforeEvents);
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("ClockEditor — accessibility", () => {
  it("the edit input has an accessible name including 'minutes and seconds'", async () => {
    setLivePaused(305);
    const user = userEvent.setup();
    render(<ClockEditor />);
    await user.click(screen.getByRole("button", { name: /adjust clock/i }));
    expect(
      screen.getByRole("textbox", { name: /minutes and seconds/i }),
    ).toBeInTheDocument();
  });
});

describe("ClockEditor — decisecond editing", () => {
  it("pre-fills SS.T format when the clock is under 60 seconds", async () => {
    setLivePaused(42.5);
    const user = userEvent.setup();
    render(<ClockEditor />);
    await user.click(screen.getByRole("button", { name: /adjust clock/i }));
    expect(screen.getByRole("textbox")).toHaveValue("42.5");
  });

  it("pre-fills SS.T with leading zero for sub-10s values", async () => {
    setLivePaused(3.2);
    const user = userEvent.setup();
    render(<ClockEditor />);
    await user.click(screen.getByRole("button", { name: /adjust clock/i }));
    expect(screen.getByRole("textbox")).toHaveValue("03.2");
  });

  it("commits a typed SS.T value with tenths precision", async () => {
    setLivePaused(42.5);
    const user = userEvent.setup();
    render(<ClockEditor />);
    await user.click(screen.getByRole("button", { name: /adjust clock/i }));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "5.3{enter}");
    expect(useGameStore.getState().clockSeconds).toBeCloseTo(5.3);
  });

  it("commits a typed mm:ss.T value with tenths precision", async () => {
    setLivePaused(462);
    const user = userEvent.setup();
    render(<ClockEditor />);
    await user.click(screen.getByRole("button", { name: /adjust clock/i }));
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "1:23.4{enter}");
    expect(useGameStore.getState().clockSeconds).toBeCloseTo(83.4);
  });

  it("round-trips a typed decisecond value through commit and re-open without dropping a tenth", async () => {
    setLivePaused(0);
    const user = userEvent.setup();
    render(<ClockEditor />);
    await user.click(screen.getByRole("button", { name: /adjust clock/i }));
    let input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "9.1{enter}");
    expect(useGameStore.getState().clockSeconds).toBeCloseTo(9.1);

    await user.click(screen.getByRole("button", { name: /adjust clock/i }));
    input = screen.getByRole("textbox");
    expect(input).toHaveValue("09.1");
  });
});
