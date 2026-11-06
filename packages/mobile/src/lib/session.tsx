import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { claimDeviceGame } from "@/lib/gameSync";
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
 * through `onAuthStateChange`. Each session claims the device's game for
 * its user before any signed-in screen renders, so one account never
 * sees, or syncs, a game another account left on the device.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, isLoading: true });

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;

    const apply = (session: Session | null) => {
      if (!active) return;
      if (session) claimDeviceGame(session.user.id);
      setState({ session, isLoading: false });
    };

    supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session))
      .catch(() => apply(null));

    const { data } = supabase.auth.onAuthStateChange((_event, session) => apply(session));
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
