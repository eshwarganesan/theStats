"use client";

/**
 * "New game" call-to-action on the Games page (feature 010-games-library,
 * US2, FR-013 / FR-014).
 *
 * Mirrors the three-step click sequence of the home page's
 * `NewGameButton` (clear persisted local game → reset the in-memory store
 * → navigate to `/setup`) so both entry points converge on identical
 * new-game semantics — see the notes on ordering in `NewGameButton.tsx`.
 *
 * Rendered above the games list on the Games page header (populated
 * state) AND as the primary CTA of the empty state (FR-010).
 */
import { useRouter } from "next/navigation";
import { type ComponentProps } from "react";

import { Button } from "@/components/ui/Button";
import { clearPersistedGame } from "@/lib/persistence";
import { useGameStore } from "@/lib/store";

type ButtonProps = ComponentProps<typeof Button>;

export interface NewGameCtaProps extends Omit<ButtonProps, "onClick" | "children"> {
  /** Optional label override. Defaults to "New game". */
  label?: string;
}

export function NewGameCta({ label = "New game", ...rest }: NewGameCtaProps) {
  const router = useRouter();

  const handleClick: ButtonProps["onClick"] = (event) => {
    if (event.defaultPrevented) return;
    clearPersistedGame();
    useGameStore.getState().resetAll();
    router.push("/setup");
  };

  return (
    <Button {...rest} onClick={handleClick}>
      {label}
    </Button>
  );
}
