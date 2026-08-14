/**
 * ProfileSection tests (feature 009-account-library, T074 coverage top-up).
 *
 * Presentational composer that stacks the profile-edit form + the
 * change-password form. Verifies the section renders both children
 * with the initial values threaded through.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The two child forms wrap Server Actions imported from
// `@/app/(authenticated)/account/actions`. That module tries to touch
// `next/headers` at import time, which is not available in the vitest
// environment — stub it so the component tree mounts.
vi.mock("@/app/(authenticated)/account/actions", () => ({
  updateDisplayName: async () => ({ ok: true }),
  changePassword: async () => ({ ok: true }),
}));

import { ProfileSection } from "./ProfileSection";

describe("ProfileSection", () => {
  it("renders both a Profile heading and a Password heading", () => {
    render(<ProfileSection email="e@example.com" initialDisplayName="Eshwar" />);
    expect(screen.getByRole("heading", { name: /profile/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /password/i })).toBeInTheDocument();
  });

  it("threads the email + display name into the profile form", () => {
    render(<ProfileSection email="coach@school.edu" initialDisplayName="Coach K" />);
    // Read-only email surface — rendered as text, not an input.
    expect(screen.getByText("coach@school.edu")).toBeInTheDocument();
    // Display-name input.
    expect(screen.getByDisplayValue("Coach K")).toBeInTheDocument();
  });

  it("renders the password-change fields", () => {
    render(<ProfileSection email="e@example.com" initialDisplayName="" />);
    // Two password inputs live inside <ChangePasswordForm>.
    const inputs = document.querySelectorAll("input[type='password']");
    expect(inputs.length).toBe(2);
  });
});
