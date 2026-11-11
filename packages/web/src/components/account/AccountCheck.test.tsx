/**
 * Tests for `AccountCheck`, which runs on the signed-out pages (`/` and
 * `/login`) and asks whether the account this browser last held still
 * exists. Feature 018-account-deletion, task T076.
 */
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as DeviceAccountModule from "@/lib/account/device-account";
import type * as PersistenceModule from "@/lib/persistence";

// Public pages: neither the game store nor Supabase may come along.
vi.mock("@/lib/store", () => {
  throw new Error("AccountCheck must not import the game store");
});
vi.mock("@/lib/supabase/client", () => {
  throw new Error("AccountCheck must not load Supabase");
});
vi.mock("@/lib/account/device-account", async (importOriginal) => ({
  ...(await importOriginal<typeof DeviceAccountModule>()),
  fetchAccountExists: vi.fn(),
}));
vi.mock("@/lib/persistence", async (importOriginal) => ({
  ...(await importOriginal<typeof PersistenceModule>()),
  readRememberedAccount: vi.fn(() => null),
  forgetRememberedAccount: vi.fn(),
}));

import { fetchAccountExists } from "@/lib/account/device-account";
import { forgetRememberedAccount, readRememberedAccount } from "@/lib/persistence";
import { AccountCheck } from "./AccountCheck";

const originalLocation = window.location;
let replace: ReturnType<typeof vi.fn>;

function atUrl(search: string) {
  replace = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: { ...originalLocation, search, replace },
  });
}

async function mount() {
  const view = render(<AccountCheck />);
  await act(async () => {});
  return view;
}

beforeEach(() => {
  vi.mocked(fetchAccountExists).mockReset();
  vi.mocked(forgetRememberedAccount).mockReset();
  vi.mocked(readRememberedAccount).mockReturnValue("u-1");
  atUrl("");
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: originalLocation,
  });
});

describe("AccountCheck", () => {
  it("shows the deleted-elsewhere notice when the remembered account is gone", async () => {
    vi.mocked(fetchAccountExists).mockResolvedValue(false);

    await mount();

    expect(fetchAccountExists).toHaveBeenCalledTimes(1);
    expect(fetchAccountExists).toHaveBeenCalledWith("u-1");
    expect(forgetRememberedAccount).toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith("/?account=deleted-elsewhere");
  });

  it("just forgets the account when it still exists", async () => {
    vi.mocked(fetchAccountExists).mockResolvedValue(true);

    await mount();

    expect(forgetRememberedAccount).toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("keeps the account for next time when the check can't be answered", async () => {
    vi.mocked(fetchAccountExists).mockResolvedValue(null);

    await mount();

    expect(forgetRememberedAccount).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("leaves the notice page to AccountNotice", async () => {
    atUrl("?account=deleted-elsewhere");
    await mount();
    expect(fetchAccountExists).not.toHaveBeenCalled();
  });

  it("doesn't check without a remembered account", async () => {
    vi.mocked(readRememberedAccount).mockReturnValue(null);
    await mount();
    expect(fetchAccountExists).not.toHaveBeenCalled();
  });

  it("renders nothing", async () => {
    vi.mocked(fetchAccountExists).mockResolvedValue(true);
    const { container } = await mount();
    expect(container).toBeEmptyDOMElement();
  });
});
