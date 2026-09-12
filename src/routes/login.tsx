import { createFileRoute, Navigate, useRouteContext } from "@tanstack/react-router";
import { LoginScreen, SignedInOwnerRedirect } from "@/components/owner-gate";
import { authEnabled } from "@/lib/auth/client";
import { GOOGLE_LOGIN_PAUSED } from "@/lib/owner";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { passwordLogin } = useRouteContext({ from: "__root__" });
  if (GOOGLE_LOGIN_PAUSED && !passwordLogin) return <Navigate to="/" />;
  return (
    <SignedInOwnerRedirect>
      {authEnabled ? (
        <LoginScreen />
      ) : (
        <main className="grid min-h-screen place-items-center p-6">
          <p className="text-sm text-muted">Sign-in is disabled.</p>
        </main>
      )}
    </SignedInOwnerRedirect>
  );
}
