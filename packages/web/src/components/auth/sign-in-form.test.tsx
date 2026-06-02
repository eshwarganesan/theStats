import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refreshMock, pushMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock, push: pushMock }),
}));

import { SignInForm } from "./sign-in-form";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

describe("<SignInForm />", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    refreshMock.mockReset();
    pushMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders email + password inputs with the correct autocomplete hints", () => {
    render(<SignInForm />);
    const email = screen.getByLabelText(/email/i);
    const password = screen.getByLabelText(/password/i);
    expect(email).toHaveAttribute("autoComplete", "email");
    expect(password).toHaveAttribute("autoComplete", "current-password");
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("POSTs to /api/auth/sign-in with the submitted body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const user = userEvent.setup();
    render(<SignInForm from="/account" />);

    await user.type(screen.getByLabelText(/email/i), "alice@example.com");
    await user.type(screen.getByLabelText(/password/i), "hunter22hunter");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe("/api/auth/sign-in");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      email: "alice@example.com",
      password: "hunter22hunter",
      next: "/account",
    });
  });

  it("on 200, refreshes the router and navigates to `from` (or /)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const user = userEvent.setup();
    render(<SignInForm from="/account" />);

    await user.type(screen.getByLabelText(/email/i), "alice@example.com");
    await user.type(screen.getByLabelText(/password/i), "hunter22hunter");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/account"));
    expect(refreshMock).toHaveBeenCalled();
  });

  it("on 401 invalid_credentials, surfaces the generic error message", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { code: "invalid_credentials", message: "Invalid email or password." } },
        { status: 401 },
      ),
    );
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.type(screen.getByLabelText(/email/i), "alice@example.com");
    await user.type(screen.getByLabelText(/password/i), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument(),
    );
  });

  it("on 403 email_unconfirmed, surfaces a Resend confirmation CTA that POSTs to the resend endpoint", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: "email_unconfirmed",
            message: "Please confirm your email before signing in.",
            details: { resend_endpoint: "/api/auth/resend-confirmation" },
          },
        },
        { status: 403 },
      ),
    );
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.type(screen.getByLabelText(/email/i), "alice@example.com");
    await user.type(screen.getByLabelText(/password/i), "right-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    const resendBtn = await screen.findByRole("button", { name: /resend confirmation/i });
    expect(resendBtn).toBeInTheDocument();

    // The resend should hit the documented endpoint with the user's email.
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await user.click(resendBtn);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [path, init] = fetchMock.mock.calls[1]!;
    expect(path).toBe("/api/auth/resend-confirmation");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      email: "alice@example.com",
    });
  });

  it("on 429 rate_limited, disables the submit button until the window passes", async () => {
    // Use a short real timer (1 second) to avoid userEvent + fake-timers
    // interaction headaches; the assertion still proves the behavior.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: "rate_limited",
            message: "Too many attempts. Please try again shortly.",
            retry_after_seconds: 1,
          },
        },
        { status: 429 },
      ),
    );
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.type(screen.getByLabelText(/email/i), "alice@example.com");
    await user.type(screen.getByLabelText(/password/i), "anything12345");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /sign in/i })).toBeDisabled(),
    );
    expect(screen.getByText(/too many attempts/i)).toBeInTheDocument();

    // After the real window expires, the button re-enables.
    await waitFor(
      () => expect(screen.getByRole("button", { name: /sign in/i })).not.toBeDisabled(),
      { timeout: 2000 },
    );
  });
});
