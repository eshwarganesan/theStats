import type { GameState } from "@thestats/app";
import { createContext, useContext, type ReactNode } from "react";
import { useStore, type StoreApi } from "zustand";

import { useGameStore } from "@/lib/store";

const GameStoreContext = createContext<StoreApi<GameState>>(useGameStore);

/**
 * Shows another game to the views inside, such as a saved game being
 * reviewed, without touching the game on this device.
 */
export function GameStoreProvider({
  store,
  children,
}: {
  store: StoreApi<GameState>;
  children: ReactNode;
}) {
  return <GameStoreContext.Provider value={store}>{children}</GameStoreContext.Provider>;
}

/**
 * Reads the game in view: the device's game, unless a GameStoreProvider
 * above shows a different one. For views that can show either.
 */
export function useGame<T>(selector: (state: GameState) => T): T {
  return useStore(useContext(GameStoreContext), selector);
}
