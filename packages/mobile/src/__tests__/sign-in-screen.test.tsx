import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo } from "react-native";

import type { AccountNoticeKind } from "@thestats/app";

import { clearAccountNotice } from "@/lib/accountGone";
import { resendConfirmation, signIn } from "@/lib/auth";

import SignInScreen from "@/app/sign-in";

const mockRouter = { push: jest.fn() };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));
jest.mock("@/lib/auth", () => ({ signIn: jest.fn(), resendConfirmation: jest.fn() }));
let mockNotice: AccountNoticeKind | null = null;
jest.mock("@/lib/accountGone", () => ({
  useAccountNotice: () => mockNotice,
  clearAccountNotice: jest.fn(),
}));
const signInMock = jest.mocked(signIn);
const resendMock = jest.mocked(resendConfirmation);

async function fillAndSubmit(email = "coach@example.com", password = "pw") {
  await render(<SignInScreen />);
  await fireEvent.changeText(screen.getByTestId("email"), email);
  await fireEvent.changeText(screen.getByTestId("password"), password);
  await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
}

beforeEach(() => {
  signInMock.mockReset();
  resendMock.mockReset();
  mockRouter.push.mockReset();
});

describe("<SignInScreen />", () => {
  it("keeps the button disabled until both fields are filled", async () => {
    await render(<SignInScreen />);
    const button = screen.getByRole("button", { name: "Sign in" });
    expect(button).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId("email"), "coach@example.com");
    expect(button).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId("password"), "pw");
    expect(button).toBeEnabled();
  });

  it("submits the credentials and leaves navigation to the session guard", async () => {
    signInMock.mockResolvedValue({ ok: true });
    await fillAndSubmit();
    await waitFor(() => expect(signInMock).toHaveBeenCalledWith("coach@example.com", "pw"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("submits from the password field's return key", async () => {
    signInMock.mockResolvedValue({ ok: true });
    await render(<SignInScreen />);
    await fireEvent.changeText(screen.getByTestId("email"), "coach@example.com");
    await fireEvent(screen.getByTestId("password"), "submitEditing");
    expect(signInMock).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByTestId("password"), "pw");
    await fireEvent(screen.getByTestId("password"), "submitEditing");
    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1));
  });

  it.each([
    [
      { ok: false, code: "invalid_credentials", message: "Invalid email or password." },
      "Invalid email or password.",
    ],
    [
      { ok: false, code: "rate_limited", message: "x", retryAfterSeconds: 12 },
      "Too many attempts. Try again in 12 seconds.",
    ],
    [
      { ok: false, code: "rate_limited", message: "x", retryAfterSeconds: 1 },
      "Too many attempts. Try again in 1 second.",
    ],
    [
      { ok: false, code: "rate_limited", message: "Too many attempts." },
      "Too many attempts.",
    ],
    [
      { ok: false, code: "email_unconfirmed", message: "x" },
      "Please confirm your email before signing in. Check your inbox for the link.",
    ],
  ] as const)("shows an error for %o", async (result, text) => {
    signInMock.mockResolvedValue(result);
    await fillAndSubmit();
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("links to creating an account", async () => {
    await render(<SignInScreen />);
    await fireEvent.press(screen.getByRole("link", { name: "Create an account" }));
    expect(mockRouter.push).toHaveBeenCalledWith("/sign-up");
  });

  it("offers to resend the confirmation email to an unconfirmed account", async () => {
    signInMock.mockResolvedValue({ ok: false, code: "email_unconfirmed", message: "x" });
    resendMock
      .mockResolvedValueOnce({ ok: false, code: "rate_limited", message: "x", retryAfterSeconds: 30 })
      .mockResolvedValueOnce({ ok: true });
    await fillAndSubmit(" coach@example.com ");
    const resend = await screen.findByRole("button", { name: "Resend confirmation email" });

    await fireEvent.press(resend);
    expect(resendMock).toHaveBeenCalledWith("coach@example.com");
    expect(screen.getByText("Too many attempts. Try again in 30 seconds.")).toBeOnTheScreen();

    await fireEvent.press(resend);
    expect(screen.getByText("Sent. Check your inbox for the new link.")).toBeOnTheScreen();
  });

  it("only offers a resend when the email needs confirming", async () => {
    signInMock.mockResolvedValue({ ok: false, code: "invalid_credentials", message: "Nope." });
    await fillAndSubmit();
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Resend confirmation email" })).toBeNull();
  });

});

describe("<SignInScreen /> account notice (feature 018)", () => {
  afterEach(() => {
    mockNotice = null;
    jest.restoreAllMocks();
  });

  it("shows and announces that the account was deleted", async () => {
    mockNotice = "deleted";
    const announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});

    await render(<SignInScreen />);

    expect(screen.getByRole("alert")).toHaveTextContent("Your account has been deleted.");
    expect(announce).toHaveBeenCalledWith("Your account has been deleted.");
  });

  it("explains a sign-out caused by deletion elsewhere, and can be dismissed", async () => {
    mockNotice = "deleted-elsewhere";
    jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => {});
    await render(<SignInScreen />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "You were signed out because this account was deleted.",
    );

    await fireEvent.press(screen.getByRole("button", { name: "Dismiss" }));

    expect(clearAccountNotice).toHaveBeenCalled();
  });

  it("shows nothing extra without a notice", async () => {
    await render(<SignInScreen />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
  });
});
