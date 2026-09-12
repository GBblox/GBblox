import { timingSafeEqual } from "node:crypto";
import { env, isWorkspacePreview } from "@/lib/env.server";

export function envLoginConfigured(): boolean {
  return Boolean(env("USER") && process.env.PASSWORD) && !isWorkspacePreview();
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
  const user = env("USER") ?? "";
  const pass = process.env.PASSWORD ?? "";
  if (!user || !pass) return false;
  return safeEqual(username.trim(), user) && safeEqual(password, pass);
}
