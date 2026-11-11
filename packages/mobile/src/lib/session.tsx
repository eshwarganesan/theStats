import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";

import { checkAccountExists } from "@/lib/account";
import { onAccountDeleted } from "@/lib/accountEvents";
import { handleAccountGone, onSignedIn } from "@/lib/accountGone";
import { claimDeviceGame, deviceGameOwner } from "@/lib/gameSync";
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
 *
 * It also notices the account disappearing (feature 018): when the API
 * reports it deleted, and, while signed out, by asking whether the account
 * the device's game belongs to still exists (once per launch per account,
 * again on the next foreground if the question went unanswered).
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, isLoading: true });
  /** Accounts already asked about this launch. */
  const answered = useRef(new Set<string>());
  const asking = useRef(false);

  useEffect(() => {
    const supabase = getSupabase();
    let active = true;

    const apply = (session: Session | null) => {
      if (!active) return;
      if (session) {
        claimDeviceGame(session.user.id);
        onSignedIn();
      }
      setState({ session, isLoading: false });
    };

    supabase.auth
      .getSession()
      .then(({ data }) => apply(data.session))
      .catch(() => apply(null));

    const { data } = supabase.auth.onAuthStateChange((_event, session) => apply(session));
    const unbindRefresh = bindAutoRefreshToAppState(supabase);
    const stopListening = onAccountDeleted(() => void handleAccountGone("deleted-elsewhere"));

    return () => {
      active = false;
      data.subscription.unsubscribe();
      unbindRefresh();
      stopListening();
    };
  }, []);

  const signedOut = !state.isLoading && state.session === null;
  useEffect(() => {
    if (!signedOut) return;
    let cancelled = false;
    const check = async () => {
      const owner = deviceGameOwner();
      if (!owner || answered.current.has(owner) || asking.current) return;
      asking.current = true;
      const exists = await checkAccountExists(owner);
      asking.current = false;
      if (cancelled || exists === null) return;
      answered.current.add(owner);
      if (!exists) await handleAccountGone("deleted-elsewhere");
    };
    void check();
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") void check();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [signedOut]);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  return useContext(SessionContext);
}
