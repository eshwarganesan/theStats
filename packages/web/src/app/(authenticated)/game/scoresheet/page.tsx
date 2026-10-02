/**
 * Server Component wrapper for the digital scoresheet at
 * `/game/scoresheet`.
 *
 * Belt-and-suspenders alongside middleware — if middleware ever fails
 * to redirect a signed-out visitor, `requireAuth` here throws a
 * `redirect("/login?from=%2Fgame%2Fscoresheet")` before any client code
 * mounts.
 */
import { requireAuth } from "@/lib/auth/require-auth";
import ScoresheetPageClient from "./ScoresheetPageClient";

export default async function ScoresheetPage() {
  await requireAuth({ from: "/game/scoresheet" });
  return <ScoresheetPageClient />;
}
