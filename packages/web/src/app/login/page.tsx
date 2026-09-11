import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { LoginPanel } from "@/components/auth/login-panel";
import { safeFrom } from "@/lib/auth/safe-from";

interface LoginPageProps {
  searchParams: Promise<{ from?: string; error?: string }>;
}

function errorMessage(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case "confirmation_failed":
      return "Your confirmation link is invalid or has expired. Sign in again to request a new one.";
    case "missing_code":
      return "That confirmation link was incomplete. Sign in to request a new one.";
    default:
      return null;
  }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.getUser();
  const from = safeFrom(params.from);
  const inlineError = errorMessage(params.error);

  if (!error && data.user) {
    redirect(from ?? "/games");
  }

  return (
    <main className="min-h-[100dvh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md flex flex-col gap-6">
        {inlineError ? (
          <div
            role="alert"
            className="border border-danger bg-danger/10 text-danger px-3 py-2 text-sm"
          >
            {inlineError}
          </div>
        ) : null}
        <LoginPanel from={from} />
      </div>
    </main>
  );
}
