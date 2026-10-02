/**
 * Server Component wrapper for the box-score view at `/game/stats`.
 *
 * Belt-and-suspenders alongside middleware — if middleware ever fails
 * to redirect a signed-out visitor, `requireAuth` here throws a
 * `redirect("/login?from=%2Fgame%2Fstats")` before any client code
 * mounts.
 */
import { requireAuth } from "@/lib/auth/require-auth";
import StatsPageClient from "./StatsPageClient";

export default async function StatsPage() {
  await requireAuth({ from: "/game/stats" });
  return <StatsPageClient />;
}
