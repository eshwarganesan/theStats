import { Suspense } from "react";
import { AuthenticatedShell } from "@/components/shell/AuthenticatedShell";
import { SidebarProfileIcon } from "@/components/shell/SidebarProfileIcon";
import { RecoveryFailedBanner } from "@/components/shell/RecoveryFailedBanner";
import { StorageUnavailableModal } from "@/components/shell/StorageUnavailableModal";
import { WriteThroughProvider } from "@/components/shell/WriteThroughMount";

export default function AuthenticatedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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
