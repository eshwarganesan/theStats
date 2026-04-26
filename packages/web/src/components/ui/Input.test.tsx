import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "./Input";

describe("Input", () => {
  it("renders without a label or hint", () => {
    render(<Input placeholder="Type" />);
    expect(screen.getByPlaceholderText("Type")).toBeInTheDocument();
  });

  it("associates the label with the input via id", () => {
    render(<Input label="Player name" />);
    const input = screen.getByLabelText("Player name");
    expect(input).toBeInTheDocument();
    expect(input.id).toBeTruthy();
  });

  it("respects an explicit id", () => {
    render(<Input id="my-id" label="Name" />);
    const input = screen.getByLabelText("Name") as HTMLInputElement;
    expect(input.id).toBe("my-id");
  });

  it("renders a hint with an aria-describedby pointer", () => {
    render(<Input label="Tag" hint="3 letters max" />);
    const input = screen.getByLabelText("Tag") as HTMLInputElement;
    const hintId = input.getAttribute("aria-describedby");
    expect(hintId).toBeTruthy();
    expect(document.getElementById(hintId!)?.textContent).toBe("3 letters max");
  });

  it("flips aria-invalid and renders the error message", () => {
    render(<Input label="Name" error="Required" />);
    const input = screen.getByLabelText("Name");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Required")).toBeInTheDocument();
  });

  it("hides the hint when an error is present", () => {
    render(<Input label="Name" hint="Hint" error="Bad" />);
    expect(screen.getByText("Bad")).toBeInTheDocument();
    expect(screen.queryByText("Hint")).not.toBeInTheDocument();
  });
});
