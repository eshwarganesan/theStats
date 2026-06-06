import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import { LoginPanel } from "./login-panel";

describe("<LoginPanel />", () => {
  it("defaults to the Sign in mode and renders the SignInForm", () => {
    render(<LoginPanel />);
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
    // SignInForm is mounted (current-password autocomplete); SignUpForm is not.
    expect(screen.getByLabelText(/password/i)).toHaveAttribute("autoComplete", "current-password");
  });

  it("renders the SignUpForm when initialMode='sign-up'", () => {
    render(<LoginPanel initialMode="sign-up" />);
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toHaveAttribute("autoComplete", "new-password");
  });

  it("toggles between Sign in and Sign up via the mode tablist", async () => {
    const user = userEvent.setup();
    render(<LoginPanel />);

    // Start on Sign in.
    expect(screen.getByLabelText(/password/i)).toHaveAttribute("autoComplete", "current-password");

    await user.click(screen.getByRole("tab", { name: /sign up/i }));
    expect(screen.getByLabelText(/password/i)).toHaveAttribute("autoComplete", "new-password");

    await user.click(screen.getByRole("tab", { name: /sign in/i }));
    expect(screen.getByLabelText(/password/i)).toHaveAttribute("autoComplete", "current-password");
  });

  it("forwards `from` to both mounted forms regardless of mode", async () => {
    const user = userEvent.setup();
    render(<LoginPanel from="/account" />);

    expect(screen.getByTestId("sign-in-form")).toHaveAttribute("data-from", "/account");
    await user.click(screen.getByRole("tab", { name: /sign up/i }));
    expect(screen.getByTestId("sign-up-form")).toHaveAttribute("data-from", "/account");
  });
});
