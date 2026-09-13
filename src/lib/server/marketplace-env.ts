import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { ownerMiddleware } from "@/lib/owner-middleware";

function env(key: string): string {
  if (typeof process === "undefined" || !process.env) return "";
  return process.env[key]?.trim() || "";
}

function first(...keys: string[]): string {
  for (const key of keys) {
    const v = env(key);
    if (v) return v;
  }
  return "";
}

export const MARKETPLACE_ENV_KEYS = {
  rebrickable: ["REBRICKABLE_API_KEY"],
  ebayClientId: ["EBAY_CLIENT_ID", "EBAY_APP_ID"],
  ebayClientSecret: ["EBAY_CLIENT_SECRET", "EBAY_CERT_ID"],
  ebayUserToken: ["EBAY_USER_TOKEN"],
  bricklinkConsumerKey: ["BRICKLINK_CONSUMER_KEY"],
  bricklinkConsumerSecret: ["BRICKLINK_CONSUMER_SECRET"],
  bricklinkToken: ["BRICKLINK_TOKEN"],
  bricklinkTokenSecret: ["BRICKLINK_TOKEN_SECRET"],
  royalMail: ["ROYAL_MAIL_API_KEY", "ROYALMAIL_API_KEY", "CLICK_AND_DROP_API_KEY"],
  royalMailSender: ["ROYAL_MAIL_SENDER_NAME"],
} as const;

export type MarketplaceSecrets = {
  rebrickableApiKey: string;
  ebayClientId: string;
  ebayClientSecret: string;
  ebayUserToken: string;
  blConsumerKey: string;
  blConsumerSecret: string;
  blToken: string;
  blTokenSecret: string;
  royalMailApiKey: string;
  royalMailSenderName: string;
};

export function marketplaceSecretsFromEnv(): MarketplaceSecrets {
  return {
    rebrickableApiKey: first(...MARKETPLACE_ENV_KEYS.rebrickable),
    ebayClientId: first(...MARKETPLACE_ENV_KEYS.ebayClientId),
    ebayClientSecret: first(...MARKETPLACE_ENV_KEYS.ebayClientSecret),
    ebayUserToken: first(...MARKETPLACE_ENV_KEYS.ebayUserToken),
    blConsumerKey: first(...MARKETPLACE_ENV_KEYS.bricklinkConsumerKey),
    blConsumerSecret: first(...MARKETPLACE_ENV_KEYS.bricklinkConsumerSecret),
    blToken: first(...MARKETPLACE_ENV_KEYS.bricklinkToken),
    blTokenSecret: first(...MARKETPLACE_ENV_KEYS.bricklinkTokenSecret),
    royalMailApiKey: first(...MARKETPLACE_ENV_KEYS.royalMail),
    royalMailSenderName: first(...MARKETPLACE_ENV_KEYS.royalMailSender),
  };
}

function pick(fromEnv: string, fromClient?: string | null): string {
  return fromEnv || (fromClient ?? "").trim();
}

export function applyMarketplaceEnv<T extends Partial<MarketplaceSecrets>>(input: T): T & MarketplaceSecrets {
  const e = marketplaceSecretsFromEnv();
  return {
    ...input,
    rebrickableApiKey: pick(e.rebrickableApiKey, input.rebrickableApiKey),
    ebayClientId: pick(e.ebayClientId, input.ebayClientId),
    ebayClientSecret: pick(e.ebayClientSecret, input.ebayClientSecret),
    ebayUserToken: pick(e.ebayUserToken, input.ebayUserToken),
    blConsumerKey: pick(e.blConsumerKey, input.blConsumerKey),
    blConsumerSecret: pick(e.blConsumerSecret, input.blConsumerSecret),
    blToken: pick(e.blToken, input.blToken),
    blTokenSecret: pick(e.blTokenSecret, input.blTokenSecret),
    royalMailApiKey: pick(e.royalMailApiKey, input.royalMailApiKey),
    royalMailSenderName: pick(e.royalMailSenderName, input.royalMailSenderName),
  };
}

export type MarketplaceApiStatus = {
  rebrickable: boolean;
  ebayApp: boolean;
  ebayUser: boolean;
  bricklink: boolean;
  royalMail: boolean;
  keys: typeof MARKETPLACE_ENV_KEYS;
};

export function marketplaceEnvStatus(): MarketplaceApiStatus {
  const e = marketplaceSecretsFromEnv();
  return {
    rebrickable: Boolean(e.rebrickableApiKey),
    ebayApp: Boolean(e.ebayClientId && e.ebayClientSecret),
    ebayUser: Boolean(e.ebayUserToken),
    bricklink: Boolean(e.blConsumerKey && e.blConsumerSecret && e.blToken && e.blTokenSecret),
    royalMail: Boolean(e.royalMailApiKey),
    keys: MARKETPLACE_ENV_KEYS,
  };
}

export const getMarketplaceApiStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware, ownerMiddleware])
  .handler(async () => marketplaceEnvStatus());
