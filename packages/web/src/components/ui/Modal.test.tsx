import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("opens via the open prop and renders title + children", () => {
    render(
      <Modal open onClose={() => {}} title="Action">
        <p>Body content</p>
      </Modal>,
    );
    expect(screen.getByRole("heading", { name: "Action" })).toBeInTheDocument();
    expect(screen.getByText("Body content")).toBeInTheDocument();
    expect((screen.getByRole("dialog") as HTMLDialogElement).hasAttribute("open")).toBe(true);
  });

  it("does not render content visibly when closed", () => {
    render(
      <Modal open={false} onClose={() => {}} title="Hidden">
        <p>Body</p>
      </Modal>,
    );
    const dialog = document.querySelector("dialog")!;
    expect(dialog.hasAttribute("open")).toBe(false);
  });

  it("calls onClose when the close (✕) button is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal open onClose={onClose} title="Hi">
        <p>Body</p>
      </Modal>,
    );
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when the backdrop (dialog itself) is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Hi">
        <p>Body</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    // Simulate a click whose target IS the dialog (backdrop), not a child.
    fireEvent.click(dialog, { target: dialog });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when the cancel event fires (ESC)", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Hi">
        <p>Body</p>
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders a footer slot when provided", () => {
    render(
      <Modal open onClose={() => {}} title="Hi" footer={<button>OK</button>}>
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByRole("button", { name: "OK" })).toBeInTheDocument();
  });

  it("supports the size prop", () => {
    render(
      <Modal open onClose={() => {}} size="sm" title="Small">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByRole("dialog").className).toMatch(/max-w-sm/);
  });

  it("renders without a title", () => {
    render(
      <Modal open onClose={() => {}}>
        <p data-testid="body">Body</p>
      </Modal>,
    );
    expect(screen.getByTestId("body")).toBeInTheDocument();
  });
});
