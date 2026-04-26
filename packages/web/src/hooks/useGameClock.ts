"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/lib/store";

/**
 * Drives the game clock via a single animation-frame loop.
 *
 * We deliberately use `requestAnimationFrame` rather than `setInterval` so
 * the displayed clock is frame-accurate (never drifts relative to the page
 * repaint). The hook does nothing when the clock is not running, so it is
 * safe to mount at the layout level.
 *
 * The hook reads `clockRunning` from the store as a selector so that the
 * effect only re-runs when the state *transitions*, not on every tick.
 */
export function useGameClock(): void {
  const running = useGameStore((s) => s.clockRunning);
  const tick = useGameStore((s) => s.tickClock);
  const lastRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) {
      lastRef.current = null;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const loop = (now: number) => {
      if (lastRef.current !== null) {
        const delta = now - lastRef.current;
        tick(delta);
      }
      lastRef.current = now;
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      lastRef.current = null;
    };
  }, [running, tick]);
}
