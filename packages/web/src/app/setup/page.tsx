"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGameStore } from "@/lib/store";
import { TeamSetupCard } from "@/components/setup/TeamSetupCard";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { GameFormat } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function SetupPage() {
  const router = useRouter();
  const settings = useGameStore((s) => s.settings);
  const setSettings = useGameStore((s) => s.setSettings);
  const prepareGame = useGameStore((s) => s.prepareGame);
  const resetAll = useGameStore((s) => s.resetAll);

  const [error, setError] = useState<string | null>(null);

  const handleContinue = () => {
    const result = prepareGame();
    if (result.ok) {
      setError(null);
      router.push("/game");
    } else {
      setError(result.reason);
    }
  };

  return (
    <main className="min-h-[100dvh] flex flex-col">
      {/* Top bar */}
      <header className="h-14 shrink-0 flex items-center justify-between px-5 md:px-8 border-b border-surface-border">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-ink-muted hover:text-ink text-sm font-mono uppercase tracking-wider"
          >
            ←
          </Link>
          <h1 className="heading-display text-xl">Game Setup</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={resetAll}>
            Reset
          </Button>
          <Button variant="primary" size="md" onClick={handleContinue}>
            Continue to Game →
          </Button>
        </div>
      </header>

      <div className="flex-1 p-4 md:p-6 grid gap-6 max-w-[1600px] w-full mx-auto">
        {/* Game settings */}
        <section className="panel p-5">
          <h2 className="label-eyebrow mb-4">Game Settings</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 items-end">
            <div className="flex flex-col gap-1.5 col-span-2 md:col-span-1">
              <label className="label-eyebrow">Format</label>
              <div className="flex">
                <FormatToggle
                  value="5v5"
                  active={settings.format === "5v5"}
                  onClick={() => setSettings({ format: "5v5" })}
                />
                <FormatToggle
                  value="3v3"
                  active={settings.format === "3v3"}
                  onClick={() => setSettings({ format: "3v3" })}
                />
              </div>
            </div>

            <Input
              label="Periods"
              type="number"
              min={1}
              max={6}
              value={settings.periods}
              onChange={(e) =>
                setSettings({ periods: Math.max(1, parseInt(e.target.value) || 1) })
              }
            />
            <Input
              label="Period length (min)"
              type="number"
              min={1}
              max={30}
              value={Math.round(settings.periodSeconds / 60)}
              onChange={(e) =>
                setSettings({
                  periodSeconds: Math.max(1, parseInt(e.target.value) || 1) * 60,
                })
              }
            />
            <Input
              label="Timeouts / game"
              type="number"
              min={0}
              max={10}
              value={settings.timeoutsPerGame}
              onChange={(e) =>
                setSettings({
                  timeoutsPerGame: Math.max(0, parseInt(e.target.value) || 0),
                })
              }
            />
            <Input
              label="Bonus fouls"
              type="number"
              min={1}
              max={10}
              value={settings.bonusFoulThreshold}
              onChange={(e) =>
                setSettings({
                  bonusFoulThreshold: Math.max(1, parseInt(e.target.value) || 1),
                })
              }
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <Input
              label="Timeout (sec)"
              type="number"
              min={0}
              max={600}
              value={settings.timeoutSeconds}
              onChange={(e) =>
                setSettings({
                  timeoutSeconds: Math.max(0, parseInt(e.target.value) || 0),
                })
              }
            />
            <Input
              label="Quarter break (sec)"
              type="number"
              min={0}
              max={1800}
              value={settings.quarterBreakSeconds}
              onChange={(e) =>
                setSettings({
                  quarterBreakSeconds: Math.max(0, parseInt(e.target.value) || 0),
                })
              }
            />
            <Input
              label="Halftime (sec)"
              type="number"
              min={0}
              max={1800}
              value={settings.halftimeBreakSeconds}
              onChange={(e) =>
                setSettings({
                  halftimeBreakSeconds: Math.max(0, parseInt(e.target.value) || 0),
                })
              }
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 items-end mt-4">
            <Input
              label="Overtime length (min)"
              type="number"
              min={0}
              max={60}
              value={Math.round(settings.overtimeSeconds / 60)}
              onChange={(e) =>
                setSettings({
                  overtimeSeconds: Math.max(0, parseInt(e.target.value) || 0) * 60,
                })
              }
            />
            <div className="flex flex-col gap-1.5 col-span-2 md:col-span-1">
              <label className="label-eyebrow">Overtime</label>
              <div className="flex">
                <OvertimeToggle
                  value="On"
                  active={settings.overtimeEnabled}
                  onClick={() => setSettings({ overtimeEnabled: true })}
                />
                <OvertimeToggle
                  value="Off"
                  active={!settings.overtimeEnabled}
                  onClick={() => setSettings({ overtimeEnabled: false })}
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <Input
              label="Competition"
              value={settings.competition}
              onChange={(e) => setSettings({ competition: e.target.value })}
              placeholder="e.g. Spring League 2026"
            />
            <Input
              label="Venue"
              value={settings.venue}
              onChange={(e) => setSettings({ venue: e.target.value })}
              placeholder="e.g. Community Arena"
            />
          </div>
        </section>

        {/* Teams */}
        <div className="grid lg:grid-cols-2 gap-6">
          <TeamSetupCard side="home" />
          <TeamSetupCard side="away" />
        </div>

        {error ? (
          <div
            role="alert"
            className="border border-danger bg-danger/10 text-danger px-4 py-3 text-sm font-mono uppercase tracking-wider"
          >
            {error}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pb-4">
          <Button variant="primary" size="lg" onClick={handleContinue}>
            Continue to Game →
          </Button>
        </div>
      </div>
    </main>
  );
}

function FormatToggle({
  value,
  active,
  onClick,
}: {
  value: GameFormat;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 h-11 text-sm font-mono uppercase tracking-widest transition-colors",
        "border first:border-r-0",
        active
          ? "border-accent bg-accent text-surface"
          : "border-surface-border bg-surface-raised text-ink-muted hover:text-ink",
      )}
      aria-pressed={active}
    >
      {value}
    </button>
  );
}

/** Two-button On/Off toggle for the Overtime opt-in setting. Mirrors the
 *  FormatToggle styling for visual consistency in the Game Settings row. */
function OvertimeToggle({
  value,
  active,
  onClick,
}: {
  value: "On" | "Off";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 h-11 text-sm font-mono uppercase tracking-widest transition-colors",
        "border first:border-r-0",
        active
          ? "border-accent bg-accent text-surface"
          : "border-surface-border bg-surface-raised text-ink-muted hover:text-ink",
      )}
      aria-pressed={active}
    >
      {value}
    </button>
  );
}
