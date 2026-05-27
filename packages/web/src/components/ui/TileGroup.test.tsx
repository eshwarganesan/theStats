import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TileGroup, Tile } from "./TileGroup";

describe("TileGroup", () => {
  it("renders a role=group with the given label as accessible name", () => {
    render(
      <TileGroup label="Side">
        <Tile selected={false} onClick={() => {}}>
          Home
        </Tile>
        <Tile selected={false} onClick={() => {}}>
          Away
        </Tile>
      </TileGroup>,
    );
    expect(screen.getByRole("group", { name: "Side" })).toBeInTheDocument();
  });

  it("renders the label as visible text (eyebrow style)", () => {
    render(
      <TileGroup label="Outcome">
        <Tile selected onClick={() => {}}>
          Made
        </Tile>
      </TileGroup>,
    );
    expect(screen.getByText("Outcome")).toBeInTheDocument();
  });

  it("defaults to a 2-column grid", () => {
    render(
      <TileGroup label="X">
        <Tile selected={false} onClick={() => {}}>
          A
        </Tile>
      </TileGroup>,
    );
    const group = screen.getByRole("group", { name: "X" });
    const grid = group.querySelector("[class*='grid']");
    expect(grid?.className).toMatch(/grid-cols-2/);
  });

  it("respects the columns prop", () => {
    render(
      <TileGroup label="Y" columns={3}>
        <Tile selected={false} onClick={() => {}}>
          A
        </Tile>
      </TileGroup>,
    );
    const grid = screen
      .getByRole("group", { name: "Y" })
      .querySelector("[class*='grid']");
    expect(grid?.className).toMatch(/grid-cols-3/);
  });
});

describe("Tile", () => {
  it("renders as a button with the children as label", () => {
    render(
      <Tile selected={false} onClick={() => {}}>
        Personal
      </Tile>,
    );
    expect(
      screen.getByRole("button", { name: "Personal" }),
    ).toBeInTheDocument();
  });

  it("sets aria-pressed=true when selected", () => {
    render(
      <Tile selected onClick={() => {}}>
        On
      </Tile>,
    );
    expect(screen.getByRole("button", { name: "On" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("sets aria-pressed=false when not selected", () => {
    render(
      <Tile selected={false} onClick={() => {}}>
        Off
      </Tile>,
    );
    expect(screen.getByRole("button", { name: "Off" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Tile selected={false} onClick={onClick}>
        Tap
      </Tile>,
    );
    await user.click(screen.getByRole("button", { name: "Tap" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("applies the accent style when selected and default variant", () => {
    render(
      <Tile selected onClick={() => {}}>
        Sel
      </Tile>,
    );
    expect(screen.getByRole("button", { name: "Sel" }).className).toMatch(
      /border-accent/,
    );
  });

  it("applies the danger style when variant=danger and selected", () => {
    render(
      <Tile selected variant="danger" onClick={() => {}}>
        Foul
      </Tile>,
    );
    expect(screen.getByRole("button", { name: "Foul" }).className).toMatch(
      /border-danger/,
    );
  });

  it("renders unselected default tile without accent border", () => {
    render(
      <Tile selected={false} onClick={() => {}}>
        Off
      </Tile>,
    );
    expect(screen.getByRole("button", { name: "Off" }).className).toMatch(
      /border-surface-border/,
    );
  });

  it("applies an inline accent color via style when accentColor is set and selected", () => {
    render(
      <Tile selected accentColor="#3B82F6" onClick={() => {}}>
        Home
      </Tile>,
    );
    const btn = screen.getByRole("button", { name: "Home" });
    expect(btn.style.borderColor).toBe("rgb(59, 130, 246)");
    expect(btn.style.color).toBe("rgb(59, 130, 246)");
    // The Tailwind class for the static accent should NOT be applied
    expect(btn.className).not.toMatch(/border-accent\b/);
  });

  it("does not apply inline accent color when accentColor is set but unselected", () => {
    render(
      <Tile selected={false} accentColor="#3B82F6" onClick={() => {}}>
        Home
      </Tile>,
    );
    const btn = screen.getByRole("button", { name: "Home" });
    expect(btn.style.borderColor).toBe("");
    // Still queryable; falls back to neutral surface border
    expect(btn.className).toMatch(/border-surface-border/);
  });
});
