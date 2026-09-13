type Cache = { token: string; exp: number; key: string };

const g = globalThis as typeof globalThis & { __ebayUserToken__?: Cache };

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

export type EbayUserAuth = {
  accessToken?: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
};

export function ebayAuthFrom(input: EbayUserAuth & {
  ebayUserToken?: string;
  ebayRefreshToken?: string;
  ebayClientId?: string;
  ebayClientSecret?: string;
} = {}): EbayUserAuth {
  return {
    accessToken: input.accessToken?.trim() || input.ebayUserToken?.trim() || "",
    refreshToken: input.refreshToken?.trim() || input.ebayRefreshToken?.trim() || "",
    clientId: input.clientId?.trim() || input.ebayClientId?.trim() || "",
    clientSecret: input.clientSecret?.trim() || input.ebayClientSecret?.trim() || "",
  };
}

function basicAuth(id: string, secret: string): string {
  const raw = `${id}:${secret}`;
  if (typeof Buffer !== "undefined") return Buffer.from(raw).toString("base64");
  return btoa(raw);
}

export function isEbayAuthError(body: string): boolean {
  return /IafTokenExpired|IAF token|Auth token is invalid|token is invalid|token expired|Invalid IAF|Authentication token is invalid|expired token|<ErrorCode>931<\/ErrorCode>|<ErrorCode>17470<\/ErrorCode>|<ErrorCode>21916014<\/ErrorCode>/i.test(
    body,
  );
}

export async function refreshEbayUserAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ token: string; expiresIn: number }> {
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    const detail = json.error_description || json.error || `HTTP ${res.status}`;
    throw new Error(
      `eBay user token expired and refresh failed (${detail}). Set EBAY_REFRESH_TOKEN plus App ID / Cert ID on Vercel — IAF access tokens only last ~2 hours.`,
    );
  }
  return { token: json.access_token, expiresIn: json.expires_in ?? 7200 };
}

export async function resolveEbayIafToken(auth: EbayUserAuth = {}, opts?: { force?: boolean }): Promise<string> {
  const clientId = first("EBAY_CLIENT_ID", "EBAY_APP_ID") || auth.clientId?.trim() || "";
  const clientSecret = first("EBAY_CLIENT_SECRET", "EBAY_CERT_ID") || auth.clientSecret?.trim() || "";
  const refreshToken = first("EBAY_REFRESH_TOKEN", "EBAY_USER_REFRESH_TOKEN") || auth.refreshToken?.trim() || "";
  const access = first("EBAY_USER_TOKEN") || auth.accessToken?.trim() || "";

  if (refreshToken && clientId && clientSecret) {
    const key = `${clientId}:${refreshToken.slice(0, 24)}`;
    const cached = g.__ebayUserToken__;
    if (!opts?.force && cached && cached.key === key && Date.now() < cached.exp - 120_000) {
      return cached.token;
    }
    try {
      const fresh = await refreshEbayUserAccessToken(clientId, clientSecret, refreshToken);
      g.__ebayUserToken__ = {
        token: fresh.token,
        exp: Date.now() + fresh.expiresIn * 1000,
        key,
      };
      return fresh.token;
    } catch (err) {
      if (access && !opts?.force) return access;
      throw err;
    }
  }

  if (access) return access;
  throw new Error(
    "eBay IAF token missing. Set EBAY_REFRESH_TOKEN (18 months) with EBAY_CLIENT_ID and EBAY_CLIENT_SECRET on Vercel. A user access token alone expires every 2 hours.",
  );
}
