/**
 * ChangePasswordForm tests.
 * Feature 009-account-library, task T017.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(authenticated)/account/actions", () => ({
  changePassword: vi.fn(),
}));

import { changePassword } from "@/app/(authenticated)/account/actions";
import { ChangePasswordForm } from "./ChangePasswordForm";

const mockedChange = vi.mocked(changePassword);

describe("ChangePasswordForm", () => {
  it("submits both fields to the changePassword server action", async () => {
    mockedChange.mockResolvedValue({ ok: true, value: { signedIn: true } });
    render(<ChangePasswordForm />);

    fireEvent.change(screen.getByLabelText(/current password/i), {
      target: { value: "old-secret" },
    });
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: "new-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() => expect(mockedChange).toHaveBeenCalledTimes(1));
    const fd = mockedChange.mock.calls[0]?.[0] as FormData;
    expect(fd.get("currentPassword")).toBe("old-secret");
    expect(fd.get("newPassword")).toBe("new-secret");
    expect(await screen.findByText(/password updated/i)).toBeInTheDocument();
  });

  it("keeps current password dirty on current_password_incorrect", async () => {
    mockedChange.mockResolvedValue({
      ok: false,
      error: {
        code: "current_password_incorrect",
        message: "Current password is incorrect.",
      },
    });
    render(<ChangePasswordForm />);

    const current = screen.getByLabelText(/current password/i) as HTMLInputElement;
    fireEvent.change(current, { target: { value: "wrong" } });
    fireEvent.change(screen.getByLabelText(/new password/i), {
      target: { value: "new-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));

    expect(
      await screen.findByText(/current password is incorrect/i),
    ).toBeInTheDocument();
    expect(current.value).toBe("wrong");
  });

  it("clears the form on success", async () => {
    mockedChange.mockResolvedValue({ ok: true, value: { signedIn: true } });
    render(<ChangePasswordForm />);

    const current = screen.getByLabelText(/current password/i) as HTMLInputElement;
    const next = screen.getByLabelText(/new password/i) as HTMLInputElement;
    fireEvent.change(current, { target: { value: "old" } });
    fireEvent.change(next, { target: { value: "new" } });
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() =>
      expect(screen.getByText(/password updated/i)).toBeInTheDocument(),
    );
    expect(current.value).toBe("");
    expect(next.value).toBe("");
  });
});
