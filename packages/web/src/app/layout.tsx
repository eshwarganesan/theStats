import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Manrope, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import { AuthPill } from "@/components/auth/auth-pill";
import { AppSidebar } from "@/components/shell/AppSidebar";
import { SidebarProfileIcon } from "@/components/shell/SidebarProfileIcon";
import { RecoveryFailedBanner } from "@/components/shell/RecoveryFailedBanner";
import { StorageUnavailableModal } from "@/components/shell/StorageUnavailableModal";
import { StorageAvailabilityProvider } from "@/lib/storageAvailability";
import "./globals.css";

const display = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

const body = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CourtLog — Digital Scoresheet",
  description:
    "A production-grade digital scoresheet and statistics tracker for basketball. Replica frontend of InGame by NBN23.",
};

export const viewport: Viewport = {
  themeColor: "#0B0B0D",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body className="font-sans">
        <StorageAvailabilityProvider>
          <RecoveryFailedBanner />
          <StorageUnavailableModal />
          <div className="flex items-stretch min-h-[100dvh]">
            <AppSidebar
              authPill={
                <Suspense fallback={null}>
                  <AuthPill />
                </Suspense>
              }
              profileIcon={
                <Suspense fallback={null}>
                  <SidebarProfileIcon />
                </Suspense>
              }
            />
            <main className="flex-1 min-w-0">{children}</main>
          </div>
        </StorageAvailabilityProvider>
      </body>
    </html>
  );
}
