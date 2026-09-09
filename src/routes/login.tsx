import { createFileRoute } from "@tanstack/react-router";
import { LoginScreen, SignedInOwnerRedirect } from "@/components/owner-gate";
import { authEnabled } from "@/lib/auth/client";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
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
