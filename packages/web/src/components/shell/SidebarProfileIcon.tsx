/**
 * SidebarProfileIcon (feature 009-account-library, US1).
 *
 * Server Component. Renders an accessible link to `/account` from the
 * bottom of the collapsible sidebar — but only for signed-in users; for
 * anonymous / signed-out sessions it renders nothing so the sidebar
 * shows only the AuthPill.
 */
import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { IconUser } from "./icons/IconUser";

export async function SidebarProfileIcon() {
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  return (
    <Link
      href="/account"
      aria-label="Account"
      className="inline-flex items-center justify-center h-10 w-10 rounded-full border border-surface-border text-ink hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface transition-colors"
    >
      <IconUser />
    </Link>
  );
}
