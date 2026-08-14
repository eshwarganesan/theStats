/**
 * ProfileForm tests.
 * Feature 009-account-library, task T016.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(authenticated)/account/actions", () => ({
  updateDisplayName: vi.fn(),
}));

import { updateDisplayName } from "@/app/(authenticated)/account/actions";
import { ProfileForm } from "./ProfileForm";

const mockedUpdate = vi.mocked(updateDisplayName);

describe("ProfileForm", () => {
  it("shows the current email as read-only and pre-fills the display name", () => {
    render(
      <ProfileForm email="u@example.com" initialDisplayName="Alex" />,
    );
    expect(screen.getByText("u@example.com")).toBeInTheDocument();
    const input = screen.getByLabelText(/display name/i) as HTMLInputElement;
    expect(input.value).toBe("Alex");
    expect(input.readOnly).toBe(false);
  });

  it("submits the entered display name via the server action", async () => {
    mockedUpdate.mockResolvedValue({ ok: true, value: { displayName: "Alex" } });
    render(<ProfileForm email="u@example.com" initialDisplayName="" />);

    const input = screen.getByLabelText(/display name/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Alex" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    const fd = mockedUpdate.mock.calls[0]?.[0] as FormData;
    expect(fd.get("displayName")).toBe("Alex");
    expect(await screen.findByText(/saved/i)).toBeInTheDocument();
  });

  it("keeps the input dirty and surfaces the error message on failure", async () => {
    mockedUpdate.mockResolvedValue({
      ok: false,
      error: { code: "display_name_too_long", message: "Too long." },
    });
    render(<ProfileForm email="u@example.com" initialDisplayName="" />);

    const input = screen.getByLabelText(/display name/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Alex" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText(/too long/i)).toBeInTheDocument();
    expect(input.value).toBe("Alex");
  });
});
