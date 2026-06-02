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

import { SignUpForm } from "./sign-up-form";

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

describe("<SignUpForm />", () => {
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

  it("renders email + password inputs and a submit button", () => {
    render(<SignUpForm />);
    expect(screen.getByLabelText(/email/i)).toHaveAttribute("type", "email");
    expect(screen.getByLabelText(/password/i)).toHaveAttribute("type", "password");
    expect(screen.getByLabelText(/password/i)).toHaveAttribute("autoComplete", "new-password");
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });

  it("POSTs to /api/auth/sign-up with the submitted email + password", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const user = userEvent.setup();
    render(<SignUpForm />);

    await user.type(screen.getByLabelText(/email/i), "alice@example.com");
    await user.type(screen.getByLabelText(/password/i), "hunter22hunter");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [path, init] = fetchMock.mock.calls[0]!;
    expect(path).toBe("/api/auth/sign-up");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      email: "alice@example.com",
      password: "hunter22hunter",
    });
  });

  it("forwards the `from` prop as `next` so the post-confirm redirect honors deep links", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const user = userEvent.setup();
    render(<SignUpForm from="/account" />);

    await user.type(screen.getByLabelText(/email/i), "alice@example.com");
    await user.type(screen.getByLabelText(/password/i), "hunter22hunter");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string).next).toBe(
      "/account",
    );
  });

  it("on 200, refreshes the router and navigates to / (or `from`)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    const user = userEvent.setup();
    render(<SignUpForm from="/account" />);

    await user.type(screen.getByLabelText(/email/i), "alice@example.com");
    await user.type(screen.getByLabelText(/password/i), "hunter22hunter");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/account"));
    expect(refreshMock).toHaveBeenCalled();
  });

  it("surfaces a 400 invalid_input error inline next to the right field", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: "invalid_input",
            message: "Please fix the highlighted fields and try again.",
            details: { field: "password", reason: "Password should be at least 6 characters." },
          },
        },
        { status: 400 },
      ),
    );
    const user = userEvent.setup();
    render(<SignUpForm />);

    await user.type(screen.getByLabelText(/email/i), "alice@example.com");
    await user.type(screen.getByLabelText(/password/i), "x");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(screen.getByText(/at least 6 characters/i)).toBeInTheDocument(),
    );
  });

  it("on 409 email_exists, surfaces a clear 'Sign in instead' message", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: "email_exists",
            message: "An account already exists for this email. Sign in instead.",
          },
        },
        { status: 409 },
      ),
    );
    const user = userEvent.setup();
    render(<SignUpForm />);

    await user.type(screen.getByLabelText(/email/i), "alice@example.com");
    await user.type(screen.getByLabelText(/password/i), "hunter22hunter");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(screen.getByText(/account already exists/i)).toBeInTheDocument(),
    );
  });

  it("on 429 rate_limited, surfaces the retry message", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: "rate_limited",
            message: "Too many attempts. Please try again shortly.",
            retry_after_seconds: 8,
          },
        },
        { status: 429 },
      ),
    );
    const user = userEvent.setup();
    render(<SignUpForm />);

    await user.type(screen.getByLabelText(/email/i), "alice@example.com");
    await user.type(screen.getByLabelText(/password/i), "hunter22hunter");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() =>
      expect(screen.getByText(/too many attempts/i)).toBeInTheDocument(),
    );
  });
});
