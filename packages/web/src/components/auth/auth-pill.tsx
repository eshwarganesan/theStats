import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

interface AuthPillProps {
  className?: string;
}

/**
 * Top-bar identity badge. US1 scope: three states (anonymous, signed-in
 * unconfirmed, signed-in confirmed). US3 will extend this with a sign-out
 * affordance.
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
        "inline-flex items-center gap-2 h-8 px-3 text-xs font-mono uppercase tracking-wider",
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
    </div>
  );
}
