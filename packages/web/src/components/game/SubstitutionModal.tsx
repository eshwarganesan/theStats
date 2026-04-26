"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useGameStore } from "@/lib/store";
import type { Side } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SubstitutionModalProps {
  open: boolean;
  onClose: () => void;
  side: Side | null;
}

export function SubstitutionModal({ open, onClose, side }: SubstitutionModalProps) {
  const homeTeam = useGameStore((s) => s.homeTeam);
  const awayTeam = useGameStore((s) => s.awayTeam);
  const onCourtState = useGameStore((s) => s.onCourt);
  const substitute = useGameStore((s) => s.substitute);

  const [playerOutId, setPlayerOutId] = useState<string | null>(null);
  const [playerInId, setPlayerInId] = useState<string | null>(null);

  // Reset the form whenever we open for a different side
  useEffect(() => {
    if (open) {
      setPlayerOutId(null);
      setPlayerInId(null);
    }
  }, [open, side]);

  if (!side) return null;
  const team = side === "home" ? homeTeam : awayTeam;
  const onCourt = onCourtState[side];

  const onCourtPlayers = team.roster.filter((p) => onCourt.includes(p.id));
  const benchPlayers = team.roster.filter((p) => !onCourt.includes(p.id));

  const canConfirm = playerOutId && playerInId;

  const confirm = () => {
    if (!canConfirm) return;
    substitute(side, playerOutId, playerInId);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Substitution — ${team.name}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirm} disabled={!canConfirm}>
            Confirm Swap
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SubColumn
          label="Player OUT (on court)"
          players={onCourtPlayers}
          selectedId={playerOutId}
          onSelect={setPlayerOutId}
          emptyMessage="No players on court."
        />
        <SubColumn
          label="Player IN (bench)"
          players={benchPlayers}
          selectedId={playerInId}
          onSelect={setPlayerInId}
          emptyMessage="No bench players available."
        />
      </div>
    </Modal>
  );
}

interface SubColumnProps {
  label: string;
  players: Array<{ id: string; name: string; number: string }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  emptyMessage: string;
}

function SubColumn({ label, players, selectedId, onSelect, emptyMessage }: SubColumnProps) {
  return (
    <div>
      <p className="label-eyebrow mb-2">{label}</p>
      {players.length === 0 ? (
        <p className="text-sm text-ink-dim italic py-6 text-center border border-dashed border-surface-border">
          {emptyMessage}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {players.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 border text-left",
                  "transition-colors hover:border-accent",
                  selectedId === p.id
                    ? "border-accent bg-accent/5"
                    : "border-surface-border bg-surface-raised",
                )}
                aria-pressed={selectedId === p.id}
              >
                <span className="font-mono tabular w-8 text-right text-ink-muted">
                  {p.number}
                </span>
                <span className="text-sm">{p.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
