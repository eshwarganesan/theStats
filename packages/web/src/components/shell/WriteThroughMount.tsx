"use client";

/**
 * Mounts the library write-through hook whenever a Supabase session is
 * present (feature 009-account-library, T040).
 *
 * Rendered from the root layout so mutations recorded on the live game
 * page — or any other page that reads/writes the Zustand store — get
 * persisted to `public.games` without every page having to opt in. A
 * no-op for anonymous sessions (feature 006's localStorage flow remains
 * authoritative).
 */

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { useLibraryWriteThrough } from "@/lib/games/writeThrough";

export function WriteThroughMount() {
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

  useLibraryWriteThrough({ signedIn });
  return null;
}
