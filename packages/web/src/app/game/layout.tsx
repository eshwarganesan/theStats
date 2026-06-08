"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGameStore } from "@/lib/store";
import { Scoreboard } from "@/components/game/Scoreboard";
import { useGameClock } from "@/hooks/useGameClock";
import { useClockCheckpoint } from "@/hooks/useClockCheckpoint";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/game", label: "Live" },
  { href: "/game/stats", label: "Stats" },
  { href: "/game/scoresheet", label: "Scoresheet" },
];

export default function GameLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const status = useGameStore((s) => s.status);

  // Mount the clock driver once at the layout level.
  useGameClock();
  // Persist the clock value at 1 Hz + on pagehide / visibilitychange so
  // a refresh restores within ≤1 s of the value at the moment of refresh.
  useClockCheckpoint();

  // If the user navigates here without completing setup, show a gentle prompt
  // rather than crashing. This is a client-side guard — SSR still renders the
  // chrome so the transition feels instantaneous.
  if (status === "setup") {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center p-6 text-center">
        <div className="max-w-sm">
          <h1 className="heading-display text-3xl mb-2">No active game</h1>
          <p className="text-ink-muted mb-6">
            Finish setup before entering the game console.
          </p>
          <Link
            href="/setup"
            className="inline-flex items-center justify-center h-11 px-5 bg-accent text-surface uppercase font-medium tracking-wider"
          >
            Go to Setup →
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] flex flex-col">
      {/* Top bar */}
      <header className="h-12 shrink-0 flex items-center justify-between px-4 md:px-6 border-b border-surface-border">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-ink-muted hover:text-ink text-sm font-mono">
            ←
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-accent" aria-hidden />
            <span className="heading-display text-base tracking-wide">CourtLog</span>
          </div>
        </div>

        <nav className="flex">
          {TABS.map((tab) => {
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "px-4 h-12 inline-flex items-center text-xs font-mono uppercase tracking-widest",
                  "border-b-2 transition-colors",
                  isActive
                    ? "border-accent text-ink"
                    : "border-transparent text-ink-muted hover:text-ink",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <Link
          href="/setup"
          className="text-xs font-mono uppercase tracking-widest text-ink-muted hover:text-ink"
        >
          Setup
        </Link>
      </header>

      {/* Scoreboard, always visible */}
      <div className="p-4 md:px-6 md:pt-4 md:pb-0 shrink-0">
        <Scoreboard />
      </div>

      {/* Page content */}
      <div className="flex-1 min-h-0 p-4 md:p-6">{children}</div>
    </main>
  );
}
