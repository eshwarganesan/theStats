"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface SignInFormProps {
  from?: string;
}

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "invalid_credentials"; message: string }
  | { kind: "email_unconfirmed"; email: string; message: string; resendEndpoint: string }
  | { kind: "rate_limited"; until: number; message: string }
  | { kind: "field-error"; field: "email" | "password" | "next" | "(root)"; message: string }
  | { kind: "banner-error"; message: string };

interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: { field?: string; reason?: string; resend_endpoint?: string };
    retry_after_seconds?: number;
  };
}

export function SignInForm({ from }: SignInFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent">("idle");

  // Rate-limit countdown — re-enables submit when window passes.
  useEffect(() => {
    if (status.kind !== "rate_limited") return;
    const ms = Math.max(0, status.until - Date.now());
    if (ms === 0) {
      setStatus({ kind: "idle" });
      return;
    }
    const t = setTimeout(() => setStatus({ kind: "idle" }), ms);
    return () => clearTimeout(t);
  }, [status]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status.kind === "submitting" || status.kind === "rate_limited") return;
    setStatus({ kind: "submitting" });
    setResendStatus("idle");

    const body: { email: string; password: string; next?: string } = { email, password };
    if (from) body.next = from;

    let res: Response;
    try {
      res = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      setStatus({ kind: "banner-error", message: "Network error. Please try again." });
      return;
    }

    if (res.ok) {
      const target = from && /^\/(?!\/)/.test(from) ? from : "/";
      window.location.assign(target);
      return;
    }

    let parsed: ErrorResponseBody | null = null;
    try {
      parsed = (await res.json()) as ErrorResponseBody;
    } catch {
      /* fall through */
    }

    if (!parsed?.error) {
      setStatus({ kind: "banner-error", message: "Something went wrong. Please try again." });
      return;
    }

    switch (parsed.error.code) {
      case "invalid_credentials":
        setStatus({ kind: "invalid_credentials", message: parsed.error.message });
        return;
      case "email_unconfirmed":
        setStatus({
          kind: "email_unconfirmed",
          email,
          message: parsed.error.message,
          resendEndpoint:
            parsed.error.details?.resend_endpoint ?? "/api/auth/resend-confirmation",
        });
        return;
      case "rate_limited": {
        const seconds = parsed.error.retry_after_seconds ?? 30;
        setStatus({
          kind: "rate_limited",
          until: Date.now() + seconds * 1000,
          message: parsed.error.message,
        });
        return;
      }
      case "invalid_input": {
        const field = parsed.error.details?.field;
        if (field === "email" || field === "password" || field === "next" || field === "(root)") {
          setStatus({
            kind: "field-error",
            field,
            message: parsed.error.details?.reason ?? parsed.error.message,
          });
          return;
        }
        setStatus({ kind: "banner-error", message: parsed.error.message });
        return;
      }
      default:
        setStatus({ kind: "banner-error", message: parsed.error.message });
    }
  }

  async function onResend() {
    if (status.kind !== "email_unconfirmed" || resendStatus === "sending") return;
    setResendStatus("sending");
    try {
      await fetch(status.resendEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: status.email }),
      });
    } finally {
      setResendStatus("sent");
    }
  }

  const isSubmitting = status.kind === "submitting";
  const isRateLimited = status.kind === "rate_limited";
  const submitDisabled = isSubmitting || isRateLimited;

  return (
    <form
      onSubmit={onSubmit}
      data-testid="sign-in-form"
      data-from={from ?? ""}
      className="flex flex-col gap-4"
      noValidate
    >
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        error={
          status.kind === "field-error" && status.field === "email" ? status.message : undefined
        }
      />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        error={
          status.kind === "field-error" && status.field === "password" ? status.message : undefined
        }
      />

      {status.kind === "invalid_credentials" ? (
        <div role="alert" className="border border-danger bg-danger/10 text-danger px-3 py-2 text-sm">
          {status.message}
        </div>
      ) : null}

      {status.kind === "email_unconfirmed" ? (
        <div
          role="alert"
          className="border border-accent bg-accent/10 text-accent px-3 py-3 text-sm flex flex-col gap-2"
        >
          <span>{status.message}</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onResend}
            disabled={resendStatus === "sending" || resendStatus === "sent"}
          >
            {resendStatus === "sent"
              ? "Confirmation email sent"
              : resendStatus === "sending"
                ? "Sending…"
                : "Resend confirmation email"}
          </Button>
        </div>
      ) : null}

      {status.kind === "rate_limited" ? (
        <div role="alert" className="border border-danger bg-danger/10 text-danger px-3 py-2 text-sm">
          {status.message}
        </div>
      ) : null}

      {status.kind === "banner-error" ? (
        <div role="alert" className="border border-danger bg-danger/10 text-danger px-3 py-2 text-sm">
          {status.message}
        </div>
      ) : null}

      <Button type="submit" variant="primary" size="lg" fullWidth disabled={submitDisabled}>
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
