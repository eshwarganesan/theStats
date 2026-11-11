/**
 * Tests for the delete-account confirmation dialog. The request and its
 * state live in `useAccountDeletion` (mocked here), so these cover what
 * the dialog renders. Feature 018-account-deletion, task T028.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE_ACCOUNT_COPY, type DeleteAccountFailure } from "@thestats/app";

const submit = vi.fn();
const reset = vi.fn();
let hookState: { pending: boolean; failure: DeleteAccountFailure | null };
vi.mock("@/lib/account/useAccountDeletion", () => ({
  useAccountDeletion: () => ({ ...hookState, submit, reset }),
}));

import { DeleteAccountDialog } from "./DeleteAccountDialog";

beforeEach(() => {
  submit.mockReset();
  reset.mockReset();
  hookState = { pending: false, failure: null };
});

const confirmButton = () => screen.getByRole("button", { name: DELETE_ACCOUNT_COPY.confirmAccessibleName });

describe("DeleteAccountDialog", () => {
  it("renders nothing while closed", () => {
    render(<DeleteAccountDialog open={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("explains what gets deleted and focuses the password field", () => {
    render(<DeleteAccountDialog open onClose={() => {}} />);

    expect(screen.getByRole("heading", { name: DELETE_ACCOUNT_COPY.dialogTitle })).toBeInTheDocument();
    expect(screen.getByText(DELETE_ACCOUNT_COPY.dialogExplanation)).toBeInTheDocument();
    expect(screen.getByLabelText(DELETE_ACCOUNT_COPY.passwordLabel)).toHaveFocus();
  });

  it("keeps Delete disabled until a password is typed", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountDialog open onClose={() => {}} />);
    expect(confirmButton()).toBeDisabled();

    await user.type(screen.getByLabelText(DELETE_ACCOUNT_COPY.passwordLabel), "pw");

    expect(confirmButton()).toBeEnabled();
  });

  it("submits the typed password from the Delete button", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountDialog open onClose={() => {}} />);

    await user.type(screen.getByLabelText(DELETE_ACCOUNT_COPY.passwordLabel), "hunter22");
    await user.click(confirmButton());

    expect(submit).toHaveBeenCalledWith("hunter22");
  });

  it("submits on Enter in the password field", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountDialog open onClose={() => {}} />);

    await user.type(screen.getByLabelText(DELETE_ACCOUNT_COPY.passwordLabel), "hunter22{Enter}");

    expect(submit).toHaveBeenCalledWith("hunter22");
  });

  it("shows a failure from the hook as an alert and stays open", () => {
    hookState.failure = { kind: "wrong-password" };
    render(<DeleteAccountDialog open onClose={() => {}} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Current password is incorrect.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes on Cancel, resetting without submitting", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DeleteAccountDialog open onClose={onClose} />);
    await user.type(screen.getByLabelText(DELETE_ACCOUNT_COPY.passwordLabel), "pw");

    await user.click(screen.getByRole("button", { name: DELETE_ACCOUNT_COPY.cancelLabel }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(reset).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
  });

  it("closes on Escape the same way", () => {
    const onClose = vi.fn();
    render(<DeleteAccountDialog open onClose={onClose} />);

    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));

    expect(onClose).toHaveBeenCalledOnce();
    expect(reset).toHaveBeenCalledOnce();
    expect(submit).not.toHaveBeenCalled();
  });

  it("clears the field when reopened", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<DeleteAccountDialog open onClose={() => {}} />);
    await user.type(screen.getByLabelText(DELETE_ACCOUNT_COPY.passwordLabel), "pw");

    rerender(<DeleteAccountDialog open={false} onClose={() => {}} />);
    rerender(<DeleteAccountDialog open onClose={() => {}} />);

    expect(screen.getByLabelText(DELETE_ACCOUNT_COPY.passwordLabel)).toHaveValue("");
  });
});

// ─── Task T063 (US3): pending state, refocus, retry ───────────────────────

describe("DeleteAccountDialog protections", () => {
  it("shows the pending state and locks the form", () => {
    hookState.pending = true;
    render(<DeleteAccountDialog open onClose={() => {}} />);

    expect(confirmButton()).toHaveTextContent(DELETE_ACCOUNT_COPY.pendingLabel);
    expect(confirmButton()).toHaveAttribute("aria-busy", "true");
    expect(confirmButton()).toBeDisabled();
    expect(screen.getByLabelText(DELETE_ACCOUNT_COPY.passwordLabel)).toBeDisabled();
    expect(screen.getByRole("button", { name: DELETE_ACCOUNT_COPY.cancelLabel })).toBeDisabled();
  });

  it("ignores Escape while a request is in flight", () => {
    hookState.pending = true;
    const onClose = vi.fn();
    render(<DeleteAccountDialog open onClose={onClose} />);

    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("refocuses and selects the password after a wrong password", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<DeleteAccountDialog open onClose={() => {}} />);
    const field = screen.getByLabelText<HTMLInputElement>(DELETE_ACCOUNT_COPY.passwordLabel);
    await user.type(field, "wrong");
    field.blur();

    hookState.failure = { kind: "wrong-password" };
    rerender(<DeleteAccountDialog open onClose={() => {}} />);

    expect(field).toHaveFocus();
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe("wrong".length);
  });

  it.each([
    [1, "Too many attempts. Try again in 1 second."],
    [12, "Too many attempts. Try again in 12 seconds."],
  ])("tells the user how long to wait (%i s)", (retryAfterSeconds, text) => {
    hookState.failure = { kind: "rate-limited", retryAfterSeconds };
    render(<DeleteAccountDialog open onClose={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent(text);
  });

  it.each(["failed", "offline"] as const)("lets the user retry after %s", async (kind) => {
    const user = userEvent.setup();
    hookState.failure = { kind };
    render(<DeleteAccountDialog open onClose={() => {}} />);

    await user.type(screen.getByLabelText(DELETE_ACCOUNT_COPY.passwordLabel), "pw");
    await user.click(confirmButton());

    expect(submit).toHaveBeenCalledWith("pw");
  });
});
