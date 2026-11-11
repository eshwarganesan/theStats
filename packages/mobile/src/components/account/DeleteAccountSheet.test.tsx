import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { DELETE_ACCOUNT_COPY } from "@thestats/app";

import { deleteAccount } from "@/lib/account";

import { DeleteAccountSheet } from "./DeleteAccountSheet";

jest.mock("@/lib/account", () => ({ deleteAccount: jest.fn() }));
const deleteMock = jest.mocked(deleteAccount);

const confirm = () => screen.getByRole("button", { name: DELETE_ACCOUNT_COPY.confirmAccessibleName });

beforeEach(() => {
  deleteMock.mockReset();
});

describe("<DeleteAccountSheet />", () => {
  it("explains what gets deleted and asks for the password", async () => {
    await render(<DeleteAccountSheet visible onClose={() => {}} />);

    expect(screen.getByText(DELETE_ACCOUNT_COPY.dialogTitle)).toBeOnTheScreen();
    expect(screen.getByText(DELETE_ACCOUNT_COPY.dialogExplanation)).toBeOnTheScreen();
    expect(screen.getByLabelText(DELETE_ACCOUNT_COPY.passwordLabel)).toHaveProp("secureTextEntry", true);
  });

  it("scrolls its content clear of the keyboard (landscape iPhone)", async () => {
    await render(<DeleteAccountSheet visible onClose={() => {}} />);
    expect(screen.getByTestId("sheet-scroll")).toHaveProp("automaticallyAdjustKeyboardInsets", true);
  });

  it("keeps Delete disabled until a password is typed", async () => {
    await render(<DeleteAccountSheet visible onClose={() => {}} />);
    expect(confirm()).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText(DELETE_ACCOUNT_COPY.passwordLabel), "pw");

    expect(confirm()).toBeEnabled();
  });

  it("deletes with the typed password", async () => {
    deleteMock.mockResolvedValue({ kind: "deleted" });
    await render(<DeleteAccountSheet visible onClose={() => {}} />);

    await fireEvent.changeText(screen.getByLabelText(DELETE_ACCOUNT_COPY.passwordLabel), "hunter22");
    await fireEvent.press(confirm());

    expect(deleteMock).toHaveBeenCalledWith("hunter22");
  });

  it("deletes from the password field's return key", async () => {
    deleteMock.mockResolvedValue({ kind: "deleted" });
    await render(<DeleteAccountSheet visible onClose={() => {}} />);
    const field = screen.getByLabelText(DELETE_ACCOUNT_COPY.passwordLabel);

    await fireEvent.changeText(field, "hunter22");
    await fireEvent(field, "submitEditing");

    expect(deleteMock).toHaveBeenCalledWith("hunter22");
  });

  it("shows why a deletion didn't happen", async () => {
    deleteMock.mockResolvedValue({ kind: "wrong-password" });
    await render(<DeleteAccountSheet visible onClose={() => {}} />);

    await fireEvent.changeText(screen.getByLabelText(DELETE_ACCOUNT_COPY.passwordLabel), "nope");
    await fireEvent.press(confirm());

    expect(await screen.findByRole("alert")).toHaveTextContent("Current password is incorrect.");
  });

  it("closes from Cancel and Close without deleting", async () => {
    const onClose = jest.fn();
    await render(<DeleteAccountSheet visible onClose={onClose} />);

    await fireEvent.press(screen.getByRole("button", { name: DELETE_ACCOUNT_COPY.cancelLabel }));
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(2);
    expect(deleteMock).not.toHaveBeenCalled();
  });
});

// ─── Task T065 (US3): pending state, one request, refocus, retry ───────────

describe("<DeleteAccountSheet /> protections", () => {
  it("shows the pending state and sends one request for a double press", async () => {
    let finish: (outcome: { kind: "failed" }) => void = () => {};
    deleteMock.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await render(<DeleteAccountSheet visible onClose={() => {}} />);
    const field = screen.getByLabelText(DELETE_ACCOUNT_COPY.passwordLabel);
    await fireEvent.changeText(field, "pw");

    await fireEvent.press(confirm());
    await fireEvent.press(confirm());

    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(confirm()).toBeBusy();
    expect(confirm()).toBeDisabled();
    expect(screen.getByLabelText(DELETE_ACCOUNT_COPY.passwordLabel)).toBeDisabled();
    expect(screen.getByRole("button", { name: DELETE_ACCOUNT_COPY.cancelLabel })).toBeDisabled();

    await act(async () => finish({ kind: "failed" }));
    expect(confirm()).not.toBeBusy();
    expect(confirm()).toBeEnabled();
  });

  it("puts the cursor back in the field after a wrong password", async () => {
    deleteMock.mockResolvedValue({ kind: "wrong-password" });
    await render(<DeleteAccountSheet visible onClose={() => {}} />);
    await fireEvent.changeText(screen.getByLabelText(DELETE_ACCOUNT_COPY.passwordLabel), "nope");

    await fireEvent.press(confirm());

    expect(await screen.findByRole("alert")).toBeOnTheScreen();
    expect(screen.getByLabelText(DELETE_ACCOUNT_COPY.passwordLabel)).toHaveProp("autoFocus", true);
  });

  it.each([
    [{ kind: "rate-limited", retryAfterSeconds: 1 } as const, "Too many attempts. Try again in 1 second."],
    [{ kind: "failed" } as const, "Something went wrong, and your account wasn't deleted. Please try again."],
    [{ kind: "offline" } as const, "Couldn't reach theStats. Check your connection and try again."],
  ])("explains %o and allows a retry", async (outcome, text) => {
    deleteMock.mockResolvedValue(outcome);
    await render(<DeleteAccountSheet visible onClose={() => {}} />);
    await fireEvent.changeText(screen.getByLabelText(DELETE_ACCOUNT_COPY.passwordLabel), "pw");

    await fireEvent.press(confirm());

    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(confirm()).toBeEnabled();
    await fireEvent.press(confirm());
    expect(deleteMock).toHaveBeenCalledTimes(2);
  });
});
