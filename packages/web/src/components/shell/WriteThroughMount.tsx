"use client";

/**
 * Mounts the library write-through hook whenever a Supabase session is
 * present (feature 009-account-library, T040) and exposes an imperative
 * save handle via context so UI (e.g. the game header's manual "Save"
 * button) can force-flush the current state.
 *
 * Rendered from the root layout so mutations recorded on the live game
 * page — or any other page that reads/writes the Zustand store — get
 * persisted to `public.games` without every page having to opt in. A
 * no-op for anonymous sessions (feature 006's localStorage flow remains
 * authoritative).
 */

import { createContext, useContext, useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  useLibraryWriteThrough,
  type WriteThroughHandle,
} from "@/lib/games/writeThrough";

interface WriteThroughContextValue extends WriteThroughHandle {
  /** Whether a Supabase session is active; false ⇒ writes are no-ops. */
  signedIn: boolean;
}

const WriteThroughContext = createContext<WriteThroughContextValue | null>(null);

/** Access the write-through save handle. Returns `null` outside the provider. */
export function useWriteThrough(): WriteThroughContextValue | null {
  return useContext(WriteThroughContext);
}

export function WriteThroughProvider({
  children,
}: {
  children?: React.ReactNode;
}) {
  const [signedIn, setSignedIn] = useState<boolean>(false);

  useEffect(() => {
    const client = createBrowserClient();

    let cancelled = false;
    void client.auth.getSession().then(({ data }) => {
      if (!cancelled) setSignedIn(Boolean(data.session));
    });

    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handle = useLibraryWriteThrough({ signedIn });

  return (
    <WriteThroughContext.Provider value={{ ...handle, signedIn }}>
      {children}
    </WriteThroughContext.Provider>
  );
}
