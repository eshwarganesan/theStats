import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { bindAutoRefreshToAppState, getSupabase } from "@/lib/supabase";

interface SessionState {
  session: Session | null;
  /** True until the stored session has been read from the keychain. */
  isLoading: boolean;
}

const SessionContext = createContext<SessionState>({ session: null, isLoading: true });

/**
 * Tracks the Supabase session for the whole app. Reads the stored
 * session once on launch, then follows sign-in, refresh and sign-out
 * through `onAuthStateChange`.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, isLoading: true });

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) setState({ session: data.session, isLoading: false });
      })
      .catch(() => {
        if (active) setState({ session: null, isLoading: false });
      });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setState({ session, isLoading: false });
    });
    const unbindRefresh = bindAutoRefreshToAppState(supabase);

    return () => {
      active = false;
      data.subscription.unsubscribe();
      unbindRefresh();
    };
  }, []);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  return useContext(SessionContext);
}
