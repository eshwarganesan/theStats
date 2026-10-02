/**
 * Server Component wrapper for the Setup page.
 *
 * Belt-and-suspenders alongside the middleware auth gate — if middleware
 * ever fails to redirect a signed-out visitor, `requireAuth` here throws
 * a `redirect("/login?from=%2Fsetup")` before any client code mounts.
 * The hardcoded `from` keeps the deep-link round-trip intact regardless
 * of which layer fires the redirect.
 */
import { requireAuth } from "@/lib/auth/require-auth";
import SetupPageClient from "./SetupPageClient";

export default async function SetupPage() {
  await requireAuth({ from: "/setup" });
  return <SetupPageClient />;
}
