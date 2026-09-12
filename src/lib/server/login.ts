import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { envLoginConfigured, envCredentialsMatch, envLoginEmail, envLoginPassword, envLoginUser, passwordLoginRequired } from "@/lib/env-login";

export const passwordLoginStatus = createServerFn({ method: "GET" }).handler(async () => {
  return { configured: envLoginConfigured(), required: passwordLoginRequired() };
});

export const prepareEnvLogin = createServerFn({ method: "POST" })
  .validator(z.object({ username: z.string().min(1), password: z.string().min(1) }))
  .handler(async ({ data }) => {
    if (!envLoginConfigured()) throw new Error("Set USER and PASSWORD (or AUTH_USER and AUTH_PASSWORD) on Vercel.");
    if (!envCredentialsMatch(data.username, data.password)) {
      throw new Error("Invalid username or password.");
    }
    const email = envLoginEmail(envLoginUser() || data.username);
    const password = envLoginPassword() ?? data.password;
    const { auth } = await import("@/lib/auth/server");
    try {
      await auth.api.signUpEmail({
        body: { email, password, name: (envLoginUser() || data.username).trim() },
      });
    } catch {
      /* already provisioned */
    }
    return { email };
  });
