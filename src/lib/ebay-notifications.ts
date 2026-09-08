import { createHash } from "node:crypto";
import { getSql } from "./db";
import { env } from "./env.server";

export function ebayNotificationToken(): string {
  return env("EBAY_NOTIFICATION_VERIFICATION_TOKEN")?.trim() || "";
}

export function ebayNotificationEndpoint(): string {
  return env("EBAY_NOTIFICATION_ENDPOINT")?.trim().replace(/\/+$/, "") || "";
}

export function ebayChallengeResponse(challengeCode: string, token: string, endpoint: string): string {
  return createHash("sha256").update(`${challengeCode}${token}${endpoint}`).digest("hex");
}

export async function ensureEbayDeletionTable() {
  const sql = await getSql();
  await sql.query(`
    create table if not exists ebay_account_deletions (
      id serial primary key,
      notification_id text not null unique,
      ebay_user_id text not null default '',
      ebay_username text not null default '',
      eias_token text not null default '',
      received_at timestamptz not null default now(),
      payload jsonb
    )
  `);
}

export async function recordEbayAccountDeletion(note: {
  notificationId: string;
  userId: string;
  username: string;
  eiasToken: string;
  payload: unknown;
}) {
  await ensureEbayDeletionTable();
  const sql = await getSql();
  await sql.query(
    `insert into ebay_account_deletions (notification_id, ebay_user_id, ebay_username, eias_token, payload)
     values ($1, $2, $3, $4, $5::jsonb)
     on conflict (notification_id) do nothing`,
    [note.notificationId, note.userId, note.username, note.eiasToken, JSON.stringify(note.payload)],
  );
  await sql
    .query(
      `update sales_orders
          set buyer = 'deleted',
              email = '',
              phone = ''
        where channel = 'ebay'
          and (lower(buyer) = lower($1) or buyer = $2)`,
      [note.username || "__none__", note.userId || "__none__"],
    )
    .catch(() => undefined);
}

export function parseDeletionNotice(body: unknown): {
  notificationId: string;
  userId: string;
  username: string;
  eiasToken: string;
} | null {
  if (!body || typeof body !== "object") return null;
  const root = body as {
    notification?: {
      notificationId?: string;
      data?: { userId?: string; username?: string; eiasToken?: string };
    };
  };
  const data = root.notification?.data;
  const notificationId = root.notification?.notificationId?.trim() || "";
  if (!notificationId && !data) return null;
  return {
    notificationId: notificationId || `evt-${Date.now()}`,
    userId: data?.userId?.trim() || "",
    username: data?.username?.trim() || "",
    eiasToken: data?.eiasToken?.trim() || "",
  };
}
