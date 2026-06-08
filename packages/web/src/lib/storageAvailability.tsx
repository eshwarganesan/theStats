"use client";

/**
 * React context exposing the browser's persistent-storage availability
 * and a "your previous game could not be recovered" signal.
 *
 * Mount `<StorageAvailabilityProvider>` once at the root layout. The
 * `<StorageUnavailableModal />` reads the boolean and blocks first paint
 * when storage is broken; `<RecoveryFailedBanner />` reads the recovery
 * flag and surfaces a dismissable banner. The provider subscribes to
 * `notifyRecoveryFailed()` so the `merge` callback in `store.ts` can
 * signal recovery failures without dragging React state into the
 * persistence module.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { isStorageAvailable, subscribeRecoveryFailed } from "./persistence";

interface StorageAvailabilityValue {
  localStorageAvailable: boolean;
  recoveryFailed: boolean;
  dismissRecoveryFailed: () => void;
}

const StorageAvailabilityContext =
  createContext<StorageAvailabilityValue | null>(null);

export function StorageAvailabilityProvider({
  children,
}: {
  children: ReactNode;
}) {
  // Probe once on mount and cache. Re-probing on every render would
  // re-run the canary write — pointless after the first render.
  const [localStorageAvailable] = useState<boolean>(() => isStorageAvailable());
  const [recoveryFailed, setRecoveryFailed] = useState<boolean>(false);

  useEffect(() => {
    const unsubscribe = subscribeRecoveryFailed(() => {
      setRecoveryFailed(true);
    });
    return unsubscribe;
  }, []);

  const dismissRecoveryFailed = useCallback(() => {
    setRecoveryFailed(false);
  }, []);

  const value = useMemo<StorageAvailabilityValue>(
    () => ({
      localStorageAvailable,
      recoveryFailed,
      dismissRecoveryFailed,
    }),
    [localStorageAvailable, recoveryFailed, dismissRecoveryFailed],
  );

  return (
    <StorageAvailabilityContext.Provider value={value}>
      {children}
    </StorageAvailabilityContext.Provider>
  );
}

export function useStorageAvailability(): StorageAvailabilityValue {
  const ctx = useContext(StorageAvailabilityContext);
  if (!ctx) {
    throw new Error(
      "useStorageAvailability must be used inside <StorageAvailabilityProvider>",
    );
  }
  return ctx;
}
