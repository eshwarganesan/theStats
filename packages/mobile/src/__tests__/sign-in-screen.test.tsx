import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { signIn } from "@/lib/auth";

import SignInScreen from "@/app/sign-in";

jest.mock("@/lib/auth", () => ({ signIn: jest.fn() }));
const signInMock = jest.mocked(signIn);

async function fillAndSubmit(email = "coach@example.com", password = "pw") {
  await render(<SignInScreen />);
  await fireEvent.changeText(screen.getByTestId("email"), email);
  await fireEvent.changeText(screen.getByTestId("password"), password);
  await fireEvent.press(screen.getByRole("button", { name: "Sign in" }));
}

beforeEach(() => signInMock.mockReset());

describe("<SignInScreen />", () => {
  it("keeps the button disabled until both fields are filled", async () => {
    await render(<SignInScreen />);
    const button = screen.getByRole("button");
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
});
