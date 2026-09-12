import { timingSafeEqual } from "node:crypto";
import { env, isWorkspacePreview } from "@/lib/env.server";

export function envLoginUser(): string | undefined {
  return env("AUTH_USER") || env("GBBLOX_USER") || env("USER");
}

export function envLoginPassword(): string | undefined {
  const pass = process.env.AUTH_PASSWORD || process.env.GBBLOX_PASSWORD || process.env.PASSWORD;
  return pass && pass.length > 0 ? pass : undefined;
}

export function envLoginConfigured(): boolean {
  return Boolean(envLoginUser() && envLoginPassword());
}

export function isVercelDeploy(): boolean {
  return Boolean(env("VERCEL") || env("VERCEL_ENV") || env("VERCEL_URL"));
}

/** Show the login screen on Vercel / Grok production. Preview stays open. */
export function passwordLoginRequired(): boolean {
  if (env("VERCEL_ENV") === "preview" && isWorkspacePreview()) return envLoginConfigured();
  if (isVercelDeploy()) return true;
  if (env("GROK_PROJECT_ID")) return true;
  return false;
}

export function envLoginEmail(username: string): string {
  const u = username.trim().toLowerCase();
  return u.includes("@") ? u : `${u}@gbblox.local`;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

export function envCredentialsMatch(username: string, password: string): boolean {
  const user = envLoginUser() ?? "";
  const pass = envLoginPassword() ?? "";
  if (!user || !pass) return false;
  return safeEqual(username.trim(), user) && safeEqual(password, pass);
}
