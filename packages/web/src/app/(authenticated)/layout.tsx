import { Suspense } from "react";
import { headers } from "next/headers";
import { AuthenticatedShell } from "@/components/shell/AuthenticatedShell";
import { SidebarProfileIcon } from "@/components/shell/SidebarProfileIcon";
import { RecoveryFailedBanner } from "@/components/shell/RecoveryFailedBanner";
import { StorageUnavailableModal } from "@/components/shell/StorageUnavailableModal";
import { WriteThroughProvider } from "@/components/shell/WriteThroughMount";
import { requireAuth } from "@/lib/auth/require-auth";
import { safeFrom } from "@/lib/auth/safe-from";

/**
 * Server-Component layout for every route under `(authenticated)/`.
 *
 * Auth gate: `requireAuth()` at the top redirects unauthenticated
 * callers to `/login` before any child page renders. This is the
 * belt-and-suspenders alongside `packages/web/middleware.ts` — if
 * middleware ever fails to redirect (edge-runtime error, cookie
 * anomaly), the layout still keeps `/setup` and `/game/*` (both of
 * which are Client Components without their own `requireAuth` call)
 * from rendering to a signed-out user.
 *
 * The `from` argument is sourced from the `x-pathname` request header
 * that middleware sets on every forwarded request. Preserving `from`
 * matters because the layout's redirect can (and does, on CI) beat
 * middleware's own redirect to `/login?from=<encoded>` on paths where
 * middleware's edge-runtime `getUser()` disagrees with the RSC-side
 * `getUser()`. Without a proper `from` the deep-link round-trip is
 * broken.
 *
 * `safeFrom` validates the header the same way it validates a query
 * param — same-origin path, ≤ 512 chars, no protocol-relative — so a
 * spoofed `x-pathname` cannot open-redirect on sign-in.
 */
export default async function AuthenticatedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const rawPathname = (await headers()).get("x-pathname") ?? undefined;
  const from = safeFrom(rawPathname ?? undefined);
  await requireAuth({ from });

  return (
    <WriteThroughProvider>
      <RecoveryFailedBanner />
      <StorageUnavailableModal />
      <AuthenticatedShell
        profileIcon={
          <Suspense fallback={null}>
            <SidebarProfileIcon />
          </Suspense>
        }
      >
        {children}
      </AuthenticatedShell>
    </WriteThroughProvider>
  );
}
