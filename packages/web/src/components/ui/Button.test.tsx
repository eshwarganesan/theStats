import { describe, it, expect, vi } from "vitest";
import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("applies the requested variant style", () => {
    render(<Button variant="danger">Stop</Button>);
    const btn = screen.getByRole("button", { name: "Stop" });
    expect(btn.className).toMatch(/bg-danger/);
  });

  it("applies the requested size", () => {
    render(<Button size="xl">Big</Button>);
    expect(screen.getByRole("button").className).toMatch(/h-16/);
  });

  it("adds w-full when fullWidth is set", () => {
    render(<Button fullWidth>Wide</Button>);
    expect(screen.getByRole("button").className).toMatch(/w-full/);
  });

  it("does not call onClick when disabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Off
      </Button>,
    );
    await user.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("calls onClick when enabled", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("forwards ref to the underlying button element", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Ref</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("merges custom className", () => {
    render(<Button className="custom-x">Cx</Button>);
    expect(screen.getByRole("button").className).toMatch(/custom-x/);
  });
});
