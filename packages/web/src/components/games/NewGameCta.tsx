"use client";

/**
 * "New game" call-to-action on the Games page (feature 010-games-library,
 * US2, FR-013 / FR-014).
 *
 * Three-step click sequence: clear persisted local game → reset the
 * in-memory store → navigate to `/setup`. The order matters — wiping
 * localStorage BEFORE the in-memory reset means we never have a window
 * where the persisted record reflects a fresh setup but the running app
 * still holds the prior game's data.
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
