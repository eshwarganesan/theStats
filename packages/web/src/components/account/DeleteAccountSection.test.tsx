/**
 * Tests for the account page's "Delete account" section.
 * Feature 018-account-deletion, task T027.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DELETE_ACCOUNT_COPY } from "@thestats/app";

vi.mock("./DeleteAccountDialog", () => ({
  DeleteAccountDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Delete your account?" /> : null,
}));

import { DeleteAccountSection } from "./DeleteAccountSection";

describe("DeleteAccountSection", () => {
  it("is a danger zone labelled Delete account, with the warning text", () => {
    render(<DeleteAccountSection />);

    const section = screen.getByRole("region", { name: DELETE_ACCOUNT_COPY.sectionHeading });
    expect(section).toHaveAttribute("data-variant", "danger");
    expect(within(section).getByText(DELETE_ACCOUNT_COPY.sectionText)).toBeInTheDocument();
  });

  it("opens the confirmation from its button", async () => {
    const user = userEvent.setup();
    render(<DeleteAccountSection />);
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: DELETE_ACCOUNT_COPY.actionLabel }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
