/**
 * Tests for the landing page's account notice.
 * Feature 018-account-deletion, task T029.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT_NOTICE_TEXT, type AccountNoticeKind } from "@thestats/app";

vi.mock("@/lib/account/device-account", () => ({ clearDeviceGameData: vi.fn() }));

import { clearDeviceGameData } from "@/lib/account/device-account";
import { AccountNotice } from "./AccountNotice";

beforeEach(() => {
  vi.mocked(clearDeviceGameData).mockReset();
});

describe("AccountNotice", () => {
  it.each(["deleted", "deleted-elsewhere"] as const)(
    "announces the %s notice as a status",
    (kind: AccountNoticeKind) => {
      render(<AccountNotice kind={kind} />);
      expect(screen.getByRole("status")).toHaveTextContent(ACCOUNT_NOTICE_TEXT[kind]);
    },
  );

  it("clears the device's game data once, on mount", () => {
    const { rerender } = render(<AccountNotice kind="deleted" />);
    rerender(<AccountNotice kind="deleted" />);
    expect(clearDeviceGameData).toHaveBeenCalledOnce();
  });

  it("can be dismissed", async () => {
    const user = userEvent.setup();
    render(<AccountNotice kind="deleted" />);

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByRole("status")).toBeNull();
  });

  it("never shows an email address (FR-018)", () => {
    const { container } = render(<AccountNotice kind="deleted-elsewhere" />);
    expect(container.textContent).not.toContain("@");
  });
});
