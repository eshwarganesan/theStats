import { Suspense } from "react";
import { AuthenticatedShell } from "@/components/shell/AuthenticatedShell";
import { SidebarProfileIcon } from "@/components/shell/SidebarProfileIcon";
import { RecoveryFailedBanner } from "@/components/shell/RecoveryFailedBanner";
import { StorageUnavailableModal } from "@/components/shell/StorageUnavailableModal";
import { WriteThroughProvider } from "@/components/shell/WriteThroughMount";
import { requireAuth } from "@/lib/auth/require-auth";

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
 * No `from` is supplied; middleware handles the deep-link round-trip
 * on the happy path, and if middleware fails, sending the user to
 * `/login` unadorned is acceptable — they lose one hop of "return
 * me to where I was", not the whole session.
 */
export default async function AuthenticatedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAuth();

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
