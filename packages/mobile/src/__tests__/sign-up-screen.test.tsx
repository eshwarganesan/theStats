import { fireEvent, render, screen } from "@testing-library/react-native";

import { resendConfirmation, signUp } from "@/lib/auth";

import SignUpScreen from "@/app/sign-up";

const mockRouter = { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
jest.mock("expo-router", () => ({ useRouter: () => mockRouter }));
jest.mock("@/lib/auth", () => ({ signUp: jest.fn(), resendConfirmation: jest.fn() }));
const signUpMock = jest.mocked(signUp);
const resendMock = jest.mocked(resendConfirmation);

async function fill(email = "new@example.com", password = "secret-pw") {
  await fireEvent.changeText(screen.getByLabelText("Email"), email);
  await fireEvent.changeText(screen.getByLabelText("Password"), password);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.canGoBack.mockReturnValue(true);
});

describe("<SignUpScreen />", () => {
  it("keeps Create account disabled until both fields are filled", async () => {
    await render(<SignUpScreen />);
    const button = screen.getByRole("button", { name: "Create account" });
    expect(button).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText("Email"), "new@example.com");
    expect(button).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText("Password"), "pw");
    expect(button).toBeEnabled();
  });

  it("creates the account, then asks to confirm the email and sign in", async () => {
    signUpMock.mockResolvedValue({ ok: true });
    await render(<SignUpScreen />);
    await fill("  new@example.com ");
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));

    expect(signUpMock).toHaveBeenCalledWith("new@example.com", "secret-pw");
    expect(screen.getByRole("header", { name: "Check your email" })).toBeOnTheScreen();
    expect(screen.getByText("new@example.com")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Back to sign in" }));
    expect(mockRouter.back).toHaveBeenCalled();
  });

  it("resends the confirmation email", async () => {
    signUpMock.mockResolvedValue({ ok: true });
    resendMock
      .mockResolvedValueOnce({ ok: false, code: "network_error", message: "Can't reach theStats." })
      .mockResolvedValueOnce({ ok: true });
    await render(<SignUpScreen />);
    await fill();
    await fireEvent(screen.getByLabelText("Password"), "submitEditing");

    await fireEvent.press(screen.getByRole("button", { name: "Resend email" }));
    expect(resendMock).toHaveBeenCalledWith("new@example.com");
    expect(screen.getByText("Can't reach theStats.")).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole("button", { name: "Resend email" }));
    expect(screen.getByText("Sent again. Check your inbox.")).toBeOnTheScreen();
  });

  it.each([
    [
      { ok: false, code: "email_exists", message: "An account already exists for this email. Sign in instead." },
      "An account already exists for this email. Sign in instead.",
    ],
    [
      { ok: false, code: "invalid_input", message: "Password should be at least 6 characters." },
      "Password should be at least 6 characters.",
    ],
    [
      { ok: false, code: "rate_limited", message: "x", retryAfterSeconds: 60 },
      "Too many attempts. Try again in 60 seconds.",
    ],
  ] as const)("shows why the account wasn't created: %o", async (result, text) => {
    signUpMock.mockResolvedValue(result);
    await render(<SignUpScreen />);
    await fill();
    await fireEvent.press(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByRole("alert")).toHaveTextContent(text);
    expect(screen.getByRole("button", { name: "Create account" })).toBeEnabled();
    expect(screen.queryByRole("header", { name: "Check your email" })).toBeNull();
  });

  it("goes back to sign in", async () => {
    await render(<SignUpScreen />);
    await fireEvent.press(screen.getByRole("link", { name: "Sign in" }));
    expect(mockRouter.back).toHaveBeenCalled();

    mockRouter.canGoBack.mockReturnValue(false);
    await fireEvent.press(screen.getByRole("link", { name: "Sign in" }));
    expect(mockRouter.replace).toHaveBeenCalledWith("/sign-in");
  });

  it("doesn't submit with a field empty", async () => {
    await render(<SignUpScreen />);
    await fireEvent.changeText(screen.getByLabelText("Email"), "new@example.com");
    await fireEvent(screen.getByLabelText("Password"), "submitEditing");
    expect(signUpMock).not.toHaveBeenCalled();
  });
});
