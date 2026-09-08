import { bricklinkUrl, ebaySearchQuery, itemNumberDisplay, marketplaceOf, rebrickableBuyUrl } from "./format";
import { bricklinkCredsFrom, fetchBricklinkGuides } from "./bricklink-store";
import type { ItemType, MarketPrice, MarketplaceId } from "./types";

type EbayCreds = {
  clientId: string;
  clientSecret: string;
  marketplace: MarketplaceId;
};

const g = globalThis as typeof globalThis & {
  __ebayAppToken__?: { token: string; exp: number; key: string };
};

function linksFor(setNum: string, name: string, marketplace: MarketplaceId, itemType: ItemType = "set"): MarketPrice["links"] {
  const q = encodeURIComponent(ebaySearchQuery(setNum, name, itemType));
  const host = marketplace === "EBAY_GB" ? "https://www.ebay.co.uk" : "https://www.ebay.com";
  return {
    rebrickable: rebrickableBuyUrl(setNum, itemType),
    bricklink: bricklinkUrl(setNum, itemType),
    ebaySold: `${host}/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1`,
  };
}

async function fetchRetailFromBrickset(setNum: string, currency: string): Promise<number | null> {
  try {
    const res = await fetch(`https://brickset.com/sets/${encodeURIComponent(setNum)}`, {
      headers: {
        "User-Agent": "GBblox/1.0 (set inventory; +https://grok.me)",
        Accept: "text/html",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/<dt>\s*RRP\s*<\/dt>\s*<dd>([^<]+)<\/dd>/i);
    if (!m?.[1]) return null;
    const blob = m[1];
    const prefer =
      currency === "GBP"
        ? /£\s*([\d,.]+)/
        : currency === "EUR"
          ? /€\s*([\d,.]+)/
          : /\$\s*([\d,.]+)/;
    const hit = blob.match(prefer) ?? blob.match(/\$\s*([\d,.]+)/);
    if (!hit?.[1]) return null;
    const n = Number(hit[1].replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function ebayAppToken(clientId: string, clientSecret: string): Promise<string> {
  const key = `${clientId}:${clientSecret}`;
  const cached = g.__ebayAppToken__;
  if (cached && cached.key === key && Date.now() < cached.exp - 30_000) return cached.token;

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || "eBay app credentials were rejected.");
  }
  g.__ebayAppToken__ = {
    token: json.access_token,
    exp: Date.now() + (json.expires_in ?? 7200) * 1000,
    key,
  };
  return json.access_token;
}

async function ebayUsedComps(
  setNum: string,
  name: string,
  creds: EbayCreds,
  itemType: ItemType = "set",
): Promise<{ avg: number; min: number; max: number; n: number } | null> {
  const token = await ebayAppToken(creds.clientId, creds.clientSecret);
  const q = ebaySearchQuery(setNum, name, itemType);
  const url =
    `https://api.ebay.com/buy/browse/v1/item_summary/search` +
    `?q=${encodeURIComponent(q)}` +
    `&limit=20&filter=${encodeURIComponent("conditions:{USED}|buyingOptions:{FIXED_PRICE}")}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": creds.marketplace,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { errors?: { message?: string }[] } | null;
    throw new Error(err?.errors?.[0]?.message || `eBay search failed (${res.status})`);
  }
  const json = (await res.json()) as {
    itemSummaries?: Array<{ price?: { value?: string }; title?: string }>;
  };
  const needle = itemNumberDisplay(setNum, itemType).toLowerCase();
  const prices = (json.itemSummaries ?? [])
    .filter((it) => (it.title ?? "").toLowerCase().includes(needle))
    .map((it) => Number(it.price?.value))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (prices.length === 0) return null;
  const trimmed =
    prices.length >= 8 ? prices.slice(1, -1) : prices;
  const avg = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  return { avg, min: prices[0], max: prices[prices.length - 1], n: prices.length };
}

function emptyBands(): Pick<
  MarketPrice,
  "used" | "usedMin" | "usedMax" | "usedCount" | "new" | "newMin" | "newMax" | "newCount" | "sampleCount"
> {
  return {
    used: null,
    usedMin: null,
    usedMax: null,
    usedCount: 0,
    new: null,
    newMin: null,
    newMax: null,
    newCount: 0,
    sampleCount: 0,
  };
}

export async function fetchMarketPrice(input: {
  setNum: string;
  name: string;
  marketplace: MarketplaceId;
  ebayClientId?: string;
  ebayClientSecret?: string;
  blConsumerKey?: string;
  blConsumerSecret?: string;
  blToken?: string;
  blTokenSecret?: string;
  itemType?: ItemType;
}): Promise<MarketPrice> {
  const market = marketplaceOf(input.marketplace);
  const itemType = input.itemType ?? "set";
  const links = linksFor(input.setNum, input.name, input.marketplace, itemType);
  const retail = itemType === "set" ? await fetchRetailFromBrickset(input.setNum, market.currency) : null;
  const empty = emptyBands();

  const bl = bricklinkCredsFrom({
    blConsumerKey: input.blConsumerKey ?? "",
    blConsumerSecret: input.blConsumerSecret ?? "",
    blToken: input.blToken ?? "",
    blTokenSecret: input.blTokenSecret ?? "",
  });
  if (bl) {
    try {
      const guides = await fetchBricklinkGuides(bl, itemType, input.setNum, market.currency);
      const used = guides.used;
      const neu = guides.neu;
      if (used || neu) {
        const bits = [
          used ? `used ${used.unitQuantity} lots` : null,
          neu ? `new ${neu.unitQuantity} lots` : null,
        ].filter(Boolean);
        return {
          ...empty,
          used: used?.avg ?? null,
          usedMin: used?.min ?? null,
          usedMax: used?.max ?? null,
          usedCount: used?.unitQuantity ?? 0,
          new: neu?.avg ?? null,
          newMin: neu?.min ?? null,
          newMax: neu?.max ?? null,
          newCount: neu?.unitQuantity ?? 0,
          sampleCount: (used?.unitQuantity ?? 0) + (neu?.unitQuantity ?? 0),
          source: "bricklink_stock",
          retail,
          currency: used?.currency || neu?.currency || market.currency,
          message: `BrickLink current items for sale · ${bits.join(" · ")}`,
          links,
        };
      }
      return {
        ...empty,
        source: null,
        retail,
        currency: market.currency,
        message: "BrickLink had no new or used price-guide stats for this item.",
        links,
      };
    } catch (err) {
      const id = input.ebayClientId?.trim();
      const secret = input.ebayClientSecret?.trim();
      if (!(id && secret)) {
        return {
          ...empty,
          source: null,
          retail,
          currency: market.currency,
          message: err instanceof Error ? err.message : "BrickLink price guide failed.",
          links,
        };
      }
    }
  }

  const id = input.ebayClientId?.trim();
  const secret = input.ebayClientSecret?.trim();
  if (id && secret) {
    try {
      const comps = await ebayUsedComps(input.setNum, input.name, {
        clientId: id,
        clientSecret: secret,
        marketplace: input.marketplace,
      }, itemType);
      if (comps) {
        return {
          ...empty,
          used: Math.round(comps.avg * 100) / 100,
          usedMin: comps.min,
          usedMax: comps.max,
          usedCount: comps.n,
          sampleCount: comps.n,
          source: "ebay_used",
          retail,
          currency: market.currency,
          message: `Average of ${comps.n} used eBay listings.`,
          links,
        };
      }
      return {
        ...empty,
        source: null,
        retail,
        currency: market.currency,
        message: "No used eBay listings matched this item number.",
        links,
      };
    } catch (err) {
      return {
        ...empty,
        source: null,
        retail,
        currency: market.currency,
        message: err instanceof Error ? err.message : "eBay price lookup failed.",
        links,
      };
    }
  }

  return {
    ...empty,
    source: null,
    retail,
    currency: market.currency,
    message: bl
      ? "BrickLink returned no price-guide stats."
      : "Add BrickLink API keys in Settings to fetch new and used price guides.",
    links,
  };
}
