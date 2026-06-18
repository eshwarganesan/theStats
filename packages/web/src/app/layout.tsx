import type { Metadata, Viewport } from "next";
import { Bebas_Neue, Manrope, JetBrains_Mono } from "next/font/google";
import { Suspense } from "react";
import { AuthPill } from "@/components/auth/auth-pill";
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
          <Suspense fallback={null}>
            <AuthPill className="fixed top-3 right-3 z-50" />
          </Suspense>
          <RecoveryFailedBanner />
          <StorageUnavailableModal />
          {children}
        </StorageAvailabilityProvider>
      </body>
    </html>
  );
}
