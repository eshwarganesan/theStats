"use client";

import { useState } from "react";
import type { Side } from "@thestats/core";
import { useGameStore } from "@/lib/store";
import { PLAYERS_ON_COURT } from "@thestats/core";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface TeamSetupCardProps {
  side: Side;
}

export function TeamSetupCard({ side }: TeamSetupCardProps) {
  const team = useGameStore((s) => (side === "home" ? s.homeTeam : s.awayTeam));
  const format = useGameStore((s) => s.settings.format);
  const setTeam = useGameStore((s) => s.setTeam);
  const addPlayer = useGameStore((s) => s.addPlayer);
  const updatePlayer = useGameStore((s) => s.updatePlayer);
  const removePlayer = useGameStore((s) => s.removePlayer);

  const [newNumber, setNewNumber] = useState("");
  const [newName, setNewName] = useState("");

  const startersTarget = PLAYERS_ON_COURT[format];
  const startersCount = team.roster.filter((p) => p.isStarter).length;
  const canAddStarter = startersCount < startersTarget;

  const handleAddPlayer = () => {
    const trimmedNum = newNumber.trim();
    const trimmedName = newName.trim();
    if (!trimmedNum || !trimmedName) return;
    // Guard against duplicate jersey numbers at UI layer for a fast feedback loop
    if (team.roster.some((p) => p.number === trimmedNum)) return;

    addPlayer(side, {
      number: trimmedNum,
      name: trimmedName,
      isStarter: canAddStarter,
      isCaptain: false,
    });
    setNewNumber("");
    setNewName("");
  };

  const sideAccent = side === "home" ? "border-home" : "border-away";
  const sideBadge =
    side === "home"
      ? "bg-home/10 text-home border-home/40"
      : "bg-away/10 text-away border-away/40";

  return (
    <section
      className={cn("panel flex flex-col border-l-4", sideAccent)}
      aria-labelledby={`team-${side}-heading`}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="px-5 py-4 flex items-center justify-between border-b border-surface-border">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "inline-flex items-center justify-center",
              "px-2 py-0.5 text-[0.6rem] font-mono uppercase tracking-widest border",
              sideBadge,
            )}
          >
            {side}
          </span>
          <h2 id={`team-${side}-heading`} className="heading-display text-xl">
            {team.name || "Unnamed Team"}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="label-eyebrow">Starters</span>
          <span
            className={cn(
              "font-mono text-sm tabular",
              startersCount === startersTarget ? "text-success" : "text-warning",
            )}
          >
            {startersCount}/{startersTarget}
          </span>
        </div>
      </header>

      {/* ── Team identity ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 px-5 py-4 border-b border-surface-border">
        <Input
          label="Team name"
          value={team.name}
          onChange={(e) => setTeam(side, { name: e.target.value })}
          placeholder={side === "home" ? "Home" : "Away"}
          maxLength={40}
        />
        <Input
          label="Tag (3 letters)"
          value={team.tag}
          onChange={(e) =>
            setTeam(side, { tag: e.target.value.toUpperCase().slice(0, 3) })
          }
          placeholder="HME"
          maxLength={3}
        />
        <Input
          label="Head coach"
          value={team.coach}
          onChange={(e) => setTeam(side, { coach: e.target.value })}
          placeholder="Optional"
          maxLength={40}
        />
        <div className="flex flex-col gap-1.5">
          <label className="label-eyebrow" htmlFor={`color-${side}`}>
            Team colour
          </label>
          <div className="flex gap-2 items-center">
            <input
              id={`color-${side}`}
              type="color"
              value={team.color}
              onChange={(e) => setTeam(side, { color: e.target.value })}
              className="h-11 w-16 bg-surface-raised border border-surface-border cursor-pointer"
              aria-label="Team colour"
            />
            <span className="font-mono text-xs text-ink-muted">{team.color.toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* ── Roster ──────────────────────────────────────────────────── */}
      <div className="px-5 py-4 flex-1">
        <div className="flex items-center justify-between mb-3">
          <h3 className="label-eyebrow">Roster ({team.roster.length})</h3>
          {team.roster.length > 0 ? (
            <span className="label-eyebrow">No. • Name • ST • C</span>
          ) : null}
        </div>

        {team.roster.length === 0 ? (
          <p className="text-sm text-ink-dim italic py-6 text-center border border-dashed border-surface-border">
            No players yet. Add at least {startersTarget} to start.
          </p>
        ) : (
          <ul className="divide-y divide-surface-border">
            {team.roster.map((p) => (
              <li
                key={p.id}
                className="grid grid-cols-[auto,1fr,auto,auto,auto] gap-3 items-center py-2"
              >
                <input
                  type="text"
                  value={p.number}
                  onChange={(e) =>
                    updatePlayer(side, p.id, {
                      number: e.target.value.slice(0, 3),
                    })
                  }
                  className="w-12 h-9 px-2 bg-surface-raised border border-surface-border text-center font-mono text-sm"
                  aria-label="Jersey number"
                />
                <input
                  type="text"
                  value={p.name}
                  onChange={(e) =>
                    updatePlayer(side, p.id, { name: e.target.value })
                  }
                  className="h-9 px-2 bg-surface-raised border border-surface-border text-sm"
                  aria-label="Player name"
                />
                <label
                  className="flex items-center gap-1.5 text-xs text-ink-muted cursor-pointer"
                  title="Starter"
                >
                  <input
                    type="checkbox"
                    checked={p.isStarter}
                    onChange={(e) =>
                      updatePlayer(side, p.id, { isStarter: e.target.checked })
                    }
                    disabled={!p.isStarter && !canAddStarter}
                    className="accent-accent"
                  />
                  <span className="font-mono uppercase">ST</span>
                </label>
                <label
                  className="flex items-center gap-1.5 text-xs text-ink-muted cursor-pointer"
                  title="Captain"
                >
                  <input
                    type="checkbox"
                    checked={p.isCaptain}
                    onChange={(e) =>
                      updatePlayer(side, p.id, { isCaptain: e.target.checked })
                    }
                    className="accent-accent"
                  />
                  <span className="font-mono uppercase">C</span>
                </label>
                <button
                  type="button"
                  onClick={() => removePlayer(side, p.id)}
                  className="w-7 h-7 flex items-center justify-center text-ink-dim hover:text-danger transition-colors"
                  aria-label={`Remove ${p.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Add-player form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAddPlayer();
          }}
          className="mt-4 grid grid-cols-[6rem,1fr,auto] gap-2"
        >
          <Input
            placeholder="#"
            value={newNumber}
            onChange={(e) => setNewNumber(e.target.value.slice(0, 3))}
            aria-label="New player jersey number"
          />
          <Input
            placeholder="Player name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            aria-label="New player name"
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={!newNumber.trim() || !newName.trim()}
          >
            Add
          </Button>
        </form>
      </div>
    </section>
  );
}
