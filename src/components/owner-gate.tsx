import { useSyncExternalStore, type ReactNode } from "react";
import { Navigate, useRouteContext } from "@tanstack/react-router";
import { GbBloxLogo } from "@/components/brick-mark";
import { Button } from "@/components/ui/button";
import { GROK_PROVIDERS, signIn, signOut } from "@/lib/auth/client";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { RedirectToSignIn, SIGN_IN_PATH } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { GOOGLE_LOGIN_PAUSED, isOwnerEmail, OWNER_EMAIL } from "@/lib/owner";

const GOOGLE = GROK_PROVIDERS.find((p) => p.idp === "google");

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export function GoogleSignInButton({ label = "Continue with Google" }: { label?: string }) {
  if (!GOOGLE) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="h-12 w-full justify-center gap-3 bg-surface text-fg"
      onClick={() => signIn(GOOGLE.providerId, { callbackURL: "/" })}
    >
      <GoogleMark />
      {label}
    </Button>
  );
}

export function AuthScreen({
  title,
  body,
  email,
  showSignOut,
}: {
  title: string;
  body: string;
  email?: string | null;
  showSignOut?: boolean;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-navy px-4 py-10 text-navy-fg">
      <div className="w-full max-w-md rounded-lg bg-surface p-6 text-fg shadow-[var(--shadow-border)] sm:p-8">
        <GbBloxLogo className="h-10 sm:h-11" />
        <h1 className="font-display mt-6 text-2xl font-extrabold tracking-tight text-navy">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
        {email ? (
          <p className="mt-3 font-mono text-xs break-all text-fg">{email}</p>
        ) : null}
        <div className="mt-6 space-y-3">
          <GoogleSignInButton />
          {showSignOut ? (
            <button
              type="button"
              className="w-full text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
              onClick={() => void signOut().catch(() => undefined)}
            >
              Sign out and try another account
            </button>
          ) : null}
        </div>
      </div>
    </main>
  );
}

export function LoginScreen() {
  return (
    <AuthScreen
      title="Staff sign-in"
      body={`GBblox is private. Sign in with Google as ${OWNER_EMAIL}. Other accounts are refused.`}
    />
  );
}

export function NotAuthorised({ email }: { email?: string | null }) {
  const gateSession = useSyncExternalStore(
    () => () => {},
    hasGateSessionMarker,
    () => false,
  );
  return (
    <AuthScreen
      title="Not authorised"
      body={`This Google account cannot open GBblox. Sign in as ${OWNER_EMAIL}.`}
      email={email}
      showSignOut={!gateSession}
    />
  );
}

export function OwnerGate({ children }: { children: ReactNode }) {
  if (GOOGLE_LOGIN_PAUSED || import.meta.env.DEV) return <>{children}</>;
  const { sessionUser } = useRouteContext({ from: "__root__" });
  const { user, isPending } = useCurrentUserState();
  const email = user?.primaryEmail ?? sessionUser?.email ?? null;
  const signedIn = Boolean(user ?? sessionUser);
  if (isPending && !sessionUser) {
    return (
      <div className="min-h-screen bg-bg">
        <div className="h-16 border-b border-border bg-surface" />
      </div>
    );
  }
  if (!signedIn) return <RedirectToSignIn to={SIGN_IN_PATH} />;
  if (!isOwnerEmail(email)) return <NotAuthorised email={email} />;
  return <>{children}</>;
}

export function SignedInOwnerRedirect({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <div className="min-h-screen bg-navy">
        <div className="h-16" />
      </div>
    );
  }
  if (user && isOwnerEmail(user.primaryEmail)) return <Navigate to="/" />;
  if (user) return <NotAuthorised email={user.primaryEmail} />;
  return <>{children}</>;
}
