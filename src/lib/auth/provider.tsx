import { useEffect, type ReactNode } from "react";
import { authClient, authEnabled, getBearerToken } from "./client";
import { persistAuthPayload, readPersistedSession } from "../session-persist";

/**
 * Hydrates a persisted session (localStorage token + cookie) on load and
 * refreshes it while the tab is open so deploys don't bounce to Unauthorized.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!authEnabled) return;
    let cancelled = false;

    async function hydrate() {
      const token = getBearerToken() ?? readPersistedSession()?.token;
      if (!token && !readPersistedSession()) {
        try {
          const { data } = await authClient.getSession();
          if (!cancelled && data) persistAuthPayload(data);
        } catch {
          /* still signed out */
        }
        return;
      }
      try {
        const { data } = await authClient.getSession();
        if (cancelled) return;
        if (data) persistAuthPayload(data);
      } catch {
        /* cookie may have dropped; bearer from localStorage still rides server fns */
      }
    }

    void hydrate();
    const onVisible = () => {
      if (document.visibilityState === "visible") void hydrate();
    };
    document.addEventListener("visibilitychange", onVisible);
    const tick = window.setInterval(() => void hydrate(), 10 * 60 * 1000);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(tick);
    };
  }, []);

  return <>{children}</>;
}
