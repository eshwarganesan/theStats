/**
 * Server Component wrapper for the live scoring console at `/game`.
 *
 * Belt-and-suspenders alongside middleware — if middleware ever fails
 * to redirect a signed-out visitor, `requireAuth` here throws a
 * `redirect("/login?from=%2Fgame")` before any client code mounts.
 */
import { requireAuth } from "@/lib/auth/require-auth";
import LiveGamePageClient from "./LiveGamePageClient";

export default async function LiveGamePage() {
  await requireAuth({ from: "/game" });
  return <LiveGamePageClient />;
}
