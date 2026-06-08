"use client";

import { useRouter } from "next/navigation";
import { type ComponentProps } from "react";

import { Button } from "@/components/ui/Button";
import { clearPersistedGame } from "@/lib/persistence";
import { useGameStore } from "@/lib/store";

type ButtonProps = ComponentProps<typeof Button>;

/**
 * Home-page entry point for starting a fresh game. Wipes the persisted
 * record (both keys) so a refresh between this click and the user's
 * next interaction does NOT resurrect the prior game. Then resets the
 * in-memory store and navigates to `/setup`.
 *
 * The order — clear → reset → navigate — matters: wiping localStorage
 * BEFORE the in-memory reset means we never have a window where the
 * persisted record reflects a fresh setup but the running app still
 * holds the prior game's data.
 */
export function NewGameButton({
  children,
  onClick,
  ...rest
}: ButtonProps) {
  const router = useRouter();

  const handleClick: ButtonProps["onClick"] = (event) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    clearPersistedGame();
    useGameStore.getState().resetAll();
    router.push("/setup");
  };

  return (
    <Button {...rest} onClick={handleClick}>
      {children}
    </Button>
  );
}
