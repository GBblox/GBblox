import { createHash, randomBytes } from "node:crypto";
import { getSql } from "./db";

export const NOTIFY_TOKEN_MIN = 32;
export const NOTIFY_TOKEN_MAX = 80;

export function isValidNotifyToken(token: string): boolean {
  const t = token.trim();
  return t.length >= NOTIFY_TOKEN_MIN && t.length <= NOTIFY_TOKEN_MAX;
}

export function generateNotifyToken(): string {
  return randomBytes(32).toString("hex");
}

function processEnv(key: string): string {
  const v = typeof process === "undefined" ? "" : process.env[key];
  return v?.trim() || "";
}

export function ebayNotificationTokenFromEnv(): string {
  return processEnv("EBAY_NOTIFICATION_VERIFICATION_TOKEN");
}

export const PUBLIC_EBAY_NOTIFY_ENDPOINT = "https://gbblox.co.uk/api/ebay/notifications";

export function ebayNotificationEndpointFromEnv(): string {
  return processEnv("EBAY_NOTIFICATION_ENDPOINT").replace(/\/+$/, "") || PUBLIC_EBAY_NOTIFY_ENDPOINT;
}

export function ebayChallengeResponse(challengeCode: string, token: string, endpoint: string): string {
  return createHash("sha256").update(`${challengeCode}${token}${endpoint}`).digest("hex");
}

export async function ensureEbayNotifyConfig() {
  const sql = await getSql();
  await sql.query(`
    create table if not exists ebay_notify_config (
      id integer primary key,
      verification_token text not null default '',
      endpoint text not null default '',
      updated_at timestamptz not null default now()
    )
  `);
  await sql.query(`insert into ebay_notify_config (id) values (1) on conflict (id) do nothing`);
}

export async function loadEbayNotifyConfig(): Promise<{ token: string; endpoint: string }> {
  const envToken = ebayNotificationTokenFromEnv();
  const envEndpoint = ebayNotificationEndpointFromEnv();
  await ensureEbayNotifyConfig();
  const sql = await getSql();
  const rows = await sql.query<{ verification_token: string; endpoint: string }>(
    "select verification_token, endpoint from ebay_notify_config where id = 1",
  );
  const row = rows[0];
  const token = isValidNotifyToken(envToken) ? envToken : (row?.verification_token ?? "");
  const endpoint = envEndpoint || row?.endpoint || PUBLIC_EBAY_NOTIFY_ENDPOINT;
  return { token, endpoint };
}

export async function saveEbayNotifyConfig(token: string, endpoint: string) {
  const trimmed = token.trim();
  if (!isValidNotifyToken(trimmed)) {
    throw new Error("Verification token must be 32–80 characters.");
  }
  await ensureEbayNotifyConfig();
  const sql = await getSql();
  await sql.query(
    `update ebay_notify_config
        set verification_token = $1,
            endpoint = $2,
            updated_at = now()
      where id = 1`,
    [trimmed, endpoint.trim().replace(/\/+$/, "")],
  );
  return { token: trimmed, endpoint: endpoint.trim().replace(/\/+$/, "") };
}

export async function ebayNotificationToken(): Promise<string> {
  const { token } = await loadEbayNotifyConfig();
  return isValidNotifyToken(token) ? token : "";
}

export async function ebayNotificationEndpoint(): Promise<string> {
  const { endpoint } = await loadEbayNotifyConfig();
  return endpoint;
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