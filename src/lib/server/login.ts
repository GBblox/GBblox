import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { envLoginConfigured, envCredentialsMatch, envLoginEmail } from "@/lib/env-login";
import { env } from "@/lib/env.server";

export const passwordLoginStatus = createServerFn({ method: "GET" }).handler(async () => {
  return { configured: envLoginConfigured() };
});

export const prepareEnvLogin = createServerFn({ method: "POST" })
  .validator(z.object({ username: z.string().min(1), password: z.string().min(1) }))
  .handler(async ({ data }) => {
    if (!envLoginConfigured()) throw new Error("Set USER and PASSWORD on Vercel to enable login.");
    if (!envCredentialsMatch(data.username, data.password)) {
      throw new Error("Invalid username or password.");
    }
    const email = envLoginEmail(env("USER") || data.username);
    const password = process.env.PASSWORD ?? data.password;
    const { auth } = await import("@/lib/auth/server");
    try {
      await auth.api.signUpEmail({
        body: { email, password, name: (env("USER") || data.username).trim() },
      });
    } catch {
      /* already provisioned */
    }
    return { email };
  });
