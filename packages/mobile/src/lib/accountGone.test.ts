import { act, renderHook } from "@testing-library/react-native";

import { forgetDeviceGame } from "@/lib/gameSync";

import {
  beginOwnDeletion,
  clearAccountNotice,
  endOwnDeletion,
  getAccountNotice,
  handleAccountGone,
  onSignedIn,
  useAccountNotice,
} from "./accountGone";

const order: string[] = [];
const mockSignOut = jest.fn();

jest.mock("@/lib/supabase", () => ({
  getSupabase: () => ({ auth: { signOut: mockSignOut } }),
}));
jest.mock("@/lib/gameSync", () => ({ forgetDeviceGame: jest.fn() }));
const forgetMock = jest.mocked(forgetDeviceGame);

beforeEach(() => {
  jest.clearAllMocks();
  order.length = 0;
  onSignedIn();
  endOwnDeletion();
  forgetMock.mockImplementation(() => {
    order.push(`forget:${getAccountNotice() ?? "none"}`);
  });
  mockSignOut.mockImplementation(async () => {
    order.push(`signOut:${getAccountNotice() ?? "none"}`);
    return { error: null };
  });
});

describe("handleAccountGone", () => {
  it("forgets the device game, sets the notice, then signs out locally", async () => {
    await handleAccountGone("deleted");

    expect(order).toEqual(["forget:none", "signOut:deleted"]);
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(getAccountNotice()).toBe("deleted");
  });

  it("runs once per signed-in session", async () => {
    await handleAccountGone("deleted-elsewhere");
    await handleAccountGone("deleted-elsewhere");
    expect(forgetMock).toHaveBeenCalledTimes(1);

    onSignedIn();
    await handleAccountGone("deleted-elsewhere");
    expect(forgetMock).toHaveBeenCalledTimes(2);
  });

  it("ignores deleted-elsewhere while this device's own deletion is in flight", async () => {
    beginOwnDeletion();

    await handleAccountGone("deleted-elsewhere");

    expect(forgetMock).not.toHaveBeenCalled();
    await handleAccountGone("deleted");
    expect(getAccountNotice()).toBe("deleted");
  });

  it("keeps the notice when the local sign-out fails", async () => {
    mockSignOut.mockRejectedValue(new Error("keychain locked"));

    await handleAccountGone("deleted-elsewhere");

    expect(getAccountNotice()).toBe("deleted-elsewhere");
  });
});

describe("account notice", () => {
  it("re-renders subscribers when it changes", async () => {
    const { result } = await renderHook(() => useAccountNotice());
    expect(result.current).toBeNull();

    await act(async () => {
      await handleAccountGone("deleted");
    });
    expect(result.current).toBe("deleted");

    await act(async () => clearAccountNotice());
    expect(result.current).toBeNull();
  });

  it("is cleared by the next sign-in", async () => {
    await handleAccountGone("deleted");
    onSignedIn();
    expect(getAccountNotice()).toBeNull();
  });
});
