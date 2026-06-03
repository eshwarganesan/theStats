import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { SignOutButton } from "./sign-out-button";

interface AuthPillProps {
  className?: string;
}

/**
 * Top-bar identity badge. Three states: anonymous, signed-in unconfirmed,
 * signed-in confirmed. Signed-in states include a sign-out control (US3).
 */
export async function AuthPill({ className }: AuthPillProps = {}) {
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.getUser();
  const user = error ? null : data.user;

  if (!user) {
    return (
      <Link
        href="/login"
        className={cn(
          "inline-flex items-center h-8 px-3 text-xs font-mono uppercase tracking-wider",
          "bg-surface-raised border border-surface-border text-ink hover:border-accent hover:text-accent",
          "transition-colors",
          className,
        )}
      >
        Sign in
      </Link>
    );
  }

  const unconfirmed = !user.email_confirmed_at;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-3 h-8 px-3 text-xs font-mono uppercase tracking-wider",
        "bg-surface-raised border border-surface-border text-ink",
        className,
      )}
    >
      <span>{user.email}</span>
      {unconfirmed ? (
        <span className="text-accent normal-case font-sans tracking-normal">
          Pending confirmation
        </span>
      ) : null}
      <SignOutButton className="text-xs" />
    </div>
  );
}
