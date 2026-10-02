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
  // Initial render (SSR + hydration) assumes storage works so the
  // server-rendered tree matches the client's first paint. The real
  // probe runs in an effect — if storage is actually unavailable we
  // flip to false after mount and the modal appears then.
  const [localStorageAvailable, setLocalStorageAvailable] =
    useState<boolean>(true);
  const [recoveryFailed, setRecoveryFailed] = useState<boolean>(false);

  useEffect(() => {
    setLocalStorageAvailable(isStorageAvailable());
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
