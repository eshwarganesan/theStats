"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface SignUpFormProps {
  from?: string;
}

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "ok"; email: string }
  | { kind: "field-error"; field: "email" | "password" | "next" | "(root)"; message: string }
  | { kind: "banner-error"; message: string };

interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: { field?: string; reason?: string };
    retry_after_seconds?: number;
  };
}

export function SignUpForm({ from }: SignUpFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status.kind === "submitting") return;
    setStatus({ kind: "submitting" });

    const body: { email: string; password: string; next?: string } = { email, password };
    if (from) body.next = from;

    let res: Response;
    try {
      res = await fetch("/api/auth/sign-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      setStatus({ kind: "banner-error", message: "Network error. Please try again." });
      return;
    }

    if (res.ok) {
      setStatus({ kind: "ok", email });
      router.refresh();
      router.push(from && /^\/(?!\/)/.test(from) ? from : "/");
      return;
    }

    let parsed: ErrorResponseBody | null = null;
    try {
      parsed = (await res.json()) as ErrorResponseBody;
    } catch {
      /* fall through to generic */
    }

    if (parsed?.error.code === "invalid_input" && parsed.error.details?.field) {
      const field = parsed.error.details.field;
      if (field === "email" || field === "password" || field === "next" || field === "(root)") {
        setStatus({
          kind: "field-error",
          field,
          message: parsed.error.details.reason ?? parsed.error.message,
        });
        return;
      }
    }
    setStatus({
      kind: "banner-error",
      message: parsed?.error.message ?? "Something went wrong. Please try again.",
    });
  }

  if (status.kind === "ok") {
    return (
      <div data-testid="sign-up-form" data-from={from ?? ""} role="status" className="panel p-5 text-sm">
        Check your email at <strong>{status.email}</strong> for a confirmation link.
        You&apos;re signed in for this session.
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      data-testid="sign-up-form"
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
        error={status.kind === "field-error" && status.field === "email" ? status.message : undefined}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        error={
          status.kind === "field-error" && status.field === "password" ? status.message : undefined
        }
      />
      {status.kind === "banner-error" ? (
        <div
          role="alert"
          className="border border-danger bg-danger/10 text-danger px-3 py-2 text-sm"
        >
          {status.message}
        </div>
      ) : null}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        disabled={status.kind === "submitting"}
      >
        {status.kind === "submitting" ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
