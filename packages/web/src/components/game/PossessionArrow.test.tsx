import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PossessionArrow } from "./PossessionArrow";

describe("PossessionArrow — rendered states", () => {
  it("renders two arrow buttons, both unpressed in the unset state", () => {
    render(<PossessionArrow direction="unset" onSelect={() => {}} />);
    const home = screen.getByRole("button", { name: /^Possession arrow: home$/ });
    const away = screen.getByRole("button", { name: /^Possession arrow: away$/ });
    expect(home).toHaveAttribute("aria-pressed", "false");
    expect(away).toHaveAttribute("aria-pressed", "false");
  });

  it("highlights only the home arrow in the home state", () => {
    render(<PossessionArrow direction="home" onSelect={() => {}} />);
    const home = screen.getByRole("button", { name: /^Possession arrow: home$/ });
    const away = screen.getByRole("button", { name: /^Possession arrow: away$/ });
    expect(home).toHaveAttribute("aria-pressed", "true");
    expect(away).toHaveAttribute("aria-pressed", "false");
    expect(home.className).toMatch(/bg-accent/);
  });

  it("highlights only the away arrow in the away state", () => {
    render(<PossessionArrow direction="away" onSelect={() => {}} />);
    const home = screen.getByRole("button", { name: /^Possession arrow: home$/ });
    const away = screen.getByRole("button", { name: /^Possession arrow: away$/ });
    expect(home).toHaveAttribute("aria-pressed", "false");
    expect(away).toHaveAttribute("aria-pressed", "true");
    expect(away.className).toMatch(/bg-accent/);
  });
});

describe("PossessionArrow — selection model (FR-006)", () => {
  it("calls onSelect('home') when the home (left) arrow is clicked from unset", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PossessionArrow direction="unset" onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: /^Possession arrow: home$/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("home");
  });

  it("calls onSelect('away') when the away (right) arrow is clicked from unset", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PossessionArrow direction="unset" onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: /^Possession arrow: away$/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("away");
  });

  it("calls onSelect('away') when the away arrow is clicked while home is selected", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PossessionArrow direction="home" onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: /^Possession arrow: away$/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("away");
  });

  it("does NOT call onSelect when the already-selected (home) arrow is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PossessionArrow direction="home" onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: /^Possession arrow: home$/ }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("does NOT call onSelect when the already-selected (away) arrow is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PossessionArrow direction="away" onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: /^Possession arrow: away$/ }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("fires onSelect on Enter keypress when an unselected arrow is focused", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PossessionArrow direction="unset" onSelect={onSelect} />);
    screen.getByRole("button", { name: /^Possession arrow: home$/ }).focus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("home");
  });

  it("fires onSelect on Space keypress when an unselected arrow is focused", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PossessionArrow direction="unset" onSelect={onSelect} />);
    screen.getByRole("button", { name: /^Possession arrow: away$/ }).focus();
    await user.keyboard(" ");
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("away");
  });
});

describe("PossessionArrow — disabled state", () => {
  it("does not fire onSelect on either arrow when disabled", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<PossessionArrow direction="home" onSelect={onSelect} disabled />);
    await user.click(screen.getByRole("button", { name: /^Possession arrow: home$/ }));
    await user.click(screen.getByRole("button", { name: /^Possession arrow: away$/ }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("sets aria-disabled and a dimmed-opacity class on each button when disabled", () => {
    render(<PossessionArrow direction="home" onSelect={() => {}} disabled />);
    const home = screen.getByRole("button", { name: /^Possession arrow: home$/ });
    const away = screen.getByRole("button", { name: /^Possession arrow: away$/ });
    expect(home).toHaveAttribute("aria-disabled", "true");
    expect(away).toHaveAttribute("aria-disabled", "true");
    expect(home.className).toMatch(/opacity-/);
    expect(away.className).toMatch(/opacity-/);
  });
});

describe("PossessionArrow — accessibility and layout", () => {
  it("uses a min 20x20 touch target on each arrow button", () => {
    render(<PossessionArrow direction="unset" onSelect={() => {}} />);
    const home = screen.getByRole("button", { name: /^Possession arrow: home$/ });
    const away = screen.getByRole("button", { name: /^Possession arrow: away$/ });
    expect(home.className).toMatch(/min-w-\[20px\]/);
    expect(home.className).toMatch(/min-h-\[20px\]/);
    expect(away.className).toMatch(/min-w-\[20px\]/);
    expect(away.className).toMatch(/min-h-\[20px\]/);
  });

  it("merges a custom className into the root container", () => {
    const { container } = render(
      <PossessionArrow
        direction="unset"
        onSelect={() => {}}
        className="custom-pa-class"
      />,
    );
    expect(container.firstChild).toHaveClass("custom-pa-class");
  });
});
