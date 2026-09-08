import { createHmac, randomBytes } from "node:crypto";
import {
  bricklinkItemCandidates,
  bricklinkItemType,
  parseBricklinkPriceGuide,
  type BricklinkPriceBand,
} from "./bricklink-price";
import { conditionCode, decodeEntities } from "./format";
import { flattenOrderItems, mapBlItems } from "./bricklink-order-items";
import { skuMatchesRemarks } from "./sku";
import type { ItemType, LegoSet, SaleLine, SaleOrder, SaleOrderDetail } from "./types";

export type { BricklinkPriceBand };
export { bricklinkItemCandidates, bricklinkItemType, parseBricklinkPriceGuide };

export type BricklinkCreds = {
  consumerKey: string;
  consumerSecret: string;
  token: string;
  tokenSecret: string;
};

export type BricklinkLot = {
  inventoryId: string;
  setNum: string;
  remarks: string;
  quantity: number;
  url: string;
};

function percentEncode(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function oauthHeader(method: string, url: string, creds: BricklinkCreds): string {
  const parsed = new URL(url);
  const nonce = randomBytes(16).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const oauth: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: creds.token,
    oauth_version: "1.0",
  };
  const all: Record<string, string> = { ...oauth };
  parsed.searchParams.forEach((value, key) => {
    all[key] = value;
  });
  const paramStr = Object.keys(all)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(all[k])}`)
    .join("&");
  const baseUrl = `${parsed.origin}${parsed.pathname}`;
  const base = `${method.toUpperCase()}&${percentEncode(baseUrl)}&${percentEncode(paramStr)}`;
  const key = `${percentEncode(creds.consumerSecret)}&${percentEncode(creds.tokenSecret)}`;
  const signature = createHmac("sha1", key).update(base).digest("base64");
  const header: Record<string, string> = { ...oauth, oauth_signature: signature };
  return `OAuth ${Object.keys(header)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(header[k])}"`)
    .join(", ")}`;
}

async function blFetch<T>(method: string, path: string, creds: BricklinkCreds, body?: unknown): Promise<T> {
  const url = `https://api.bricklink.com/api/store/v1${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: oauthHeader(method, url, creds),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: {
    meta?: { code?: number; message?: string; description?: string };
    data?: T;
  };
  try {
    json = JSON.parse(text) as typeof json;
  } catch {
    throw new Error(
      res.ok
        ? "BrickLink store API returned a non-JSON response."
        : `BrickLink store API error (${res.status}). Check the four API keys.`,
    );
  }
  const code = json.meta?.code ?? res.status;
  if (code >= 400) {
    throw new Error(json.meta?.description || json.meta?.message || `BrickLink API error (${code})`);
  }
  return json.data as T;
}

export function bricklinkCredsFrom(settings: {
  blConsumerKey: string;
  blConsumerSecret: string;
  blToken: string;
  blTokenSecret: string;
}): BricklinkCreds | null {
  const consumerKey = settings.blConsumerKey.trim();
  const consumerSecret = settings.blConsumerSecret.trim();
  const token = settings.blToken.trim();
  const tokenSecret = settings.blTokenSecret.trim();
  if (!consumerKey || !consumerSecret || !token || !tokenSecret) return null;
  return { consumerKey, consumerSecret, token, tokenSecret };
}

type InventoryRow = {
  inventory_id: number | string;
  item?: { no?: string; type?: string };
  quantity?: number;
  remarks?: string;
};

function toLot(row: InventoryRow): BricklinkLot {
  const inventoryId = String(row.inventory_id);
  const setNum = row.item?.no ?? "";
  return {
    inventoryId,
    setNum,
    remarks: (row.remarks ?? "").trim(),
    quantity: row.quantity ?? 0,
    url: `https://www.bricklink.com/v2/inventory_detail.page?invid=${encodeURIComponent(inventoryId)}`,
  };
}

export async function listBricklinkInventories(creds: BricklinkCreds): Promise<BricklinkLot[]> {
  const rows: InventoryRow[] = [];
  for (const type of ["SET", "MINIFIG"] as const) {
    const data = await blFetch<InventoryRow[]>("GET", `/inventories?item_type=${type}`, creds);
    if (Array.isArray(data)) rows.push(...data);
  }
  return rows.map(toLot);
}

/** Match app SKU to BrickLink lot Remarks only. */
export function matchBricklinkLot(lots: BricklinkLot[], sku: string): BricklinkLot | null {
  return lots.find((lot) => skuMatchesRemarks(sku, lot.remarks)) ?? null;
}

export async function findBricklinkBySku(creds: BricklinkCreds, sku: string): Promise<BricklinkLot | null> {
  const lots = await listBricklinkInventories(creds);
  return matchBricklinkLot(lots, sku);
}

function completenessOf(set: LegoSet): "S" | "C" | "B" {
  if (set.condition === "new_sealed") return "S";
  if (set.condition === "used_incomplete" || set.condition === "used_parts") return "B";
  return "C";
}

export function bricklinkListingDescription(set: LegoSet): string {
  const instructions =
    set.comesWithInstructions === "yes" ? "Comes with instructions" : "Does not come with instructions";
  const box = set.comesWithBox === "yes" ? "Comes with box" : "Does not come with box";
  const notes = set.notes.trim();
  const body = notes ? `${instructions} - ${box}. ${notes}` : `${instructions} - ${box}`;
  return body.slice(0, 2000);
}

export async function createBricklinkLot(creds: BricklinkCreds, set: LegoSet): Promise<BricklinkLot> {
  if (set.askingPrice == null || set.askingPrice <= 0) {
    throw new Error("Set a price before listing on BrickLink.");
  }
  const type = bricklinkItemType(set.itemType);
  const no = bricklinkItemCandidates(set.itemType, set.setNum)[0] ?? set.setNum;
  const created = await blFetch<InventoryRow>("POST", "/inventories", creds, {
    item: { no, type },
    color_id: 0,
    quantity: Math.max(1, set.qty),
    unit_price: set.askingPrice.toFixed(3),
    new_or_used: conditionCode(set.condition),
    completeness: set.itemType === "minifig" ? undefined : completenessOf(set),
    remarks: set.sku,
    description: bricklinkListingDescription(set),
    is_retain: false,
    is_stock_room: false,
  });
  return toLot(created);
}

export async function testBricklinkCreds(creds: BricklinkCreds): Promise<{ lots: number }> {
  const lots = await listBricklinkInventories(creds);
  return { lots: lots.length };
}

type BlCategory = { category_id?: number; category_name?: string; name?: string; parent_id?: number | null };
type BlItem = {
  no?: string;
  name?: string;
  type?: string;
  category_id?: number;
  year_released?: number | null;
  weight?: string | number | null;
  image_url?: string | null;
  thumbnail_url?: string | null;
};

const g = globalThis as typeof globalThis & {
  __blCats__?: { loadedAt: number; map: Map<number, { id: number; name: string; parentId: number | null }> };
};

async function categoryMap(creds: BricklinkCreds) {
  const cached = g.__blCats__;
  if (cached && Date.now() - cached.loadedAt < 6 * 60 * 60 * 1000) return cached.map;
  const rows = (await blFetch<BlCategory[]>("GET", "/categories", creds)) ?? [];
  const map = new Map<number, { id: number; name: string; parentId: number | null }>();
  for (const row of rows) {
    const id = Number(row.category_id);
    if (!Number.isFinite(id)) continue;
    map.set(id, {
      id,
      name: decodeEntities(row.category_name || row.name || String(id)),
      parentId: row.parent_id != null ? Number(row.parent_id) : null,
    });
  }
  g.__blCats__ = { loadedAt: Date.now(), map };
  return map;
}

function splitBlCategory(
  categoryId: number | undefined,
  cats: Map<number, { id: number; name: string; parentId: number | null }>,
): { category: string | null; subCategory: string | null } {
  if (categoryId == null) return { category: null, subCategory: null };
  const leaf = cats.get(categoryId);
  if (!leaf) return { category: null, subCategory: null };
  const parent = leaf.parentId != null ? cats.get(leaf.parentId) : undefined;
  if (!parent || parent.id === 0 || /^(minifigures?|sets?|catalog|root)$/i.test(parent.name)) {
    return { category: leaf.name, subCategory: null };
  }
  return { category: parent.name, subCategory: leaf.name };
}

export function bricklinkImageUrl(type: ItemType, itemNo: string): string {
  if (type === "minifig") {
    return `https://www.brickeconomy.com/resources/images/minifigs/${encodeURIComponent(itemNo)}_medium.jpg`;
  }
  return `https://img.bricklink.com/ItemImage/SN/0/${encodeURIComponent(itemNo)}.png`;
}

export async function fetchBricklinkCatalogItem(
  creds: BricklinkCreds,
  itemType: ItemType,
  itemNo: string,
): Promise<{
  itemNo: string;
  itemType: ItemType;
  name: string;
  year: number | null;
  category: string | null;
  subCategory: string | null;
  weightGrams: number | null;
  imageUrl: string;
} | null> {
  const type = bricklinkItemType(itemType);
  let item: BlItem | null = null;
  let usedNo = itemNo;
  for (const no of bricklinkItemCandidates(itemType, itemNo)) {
    try {
      const data = await blFetch<BlItem>("GET", `/items/${type}/${encodeURIComponent(no)}`, creds);
      if (data?.no && data.name) {
        item = data;
        usedNo = data.no;
        break;
      }
    } catch {
      /* try next candidate */
    }
  }
  if (!item) return null;
  let category: string | null = null;
  let subCategory: string | null = null;
  try {
    const cats = await categoryMap(creds);
    const split = splitBlCategory(item.category_id, cats);
    category = split.category;
    subCategory = split.subCategory;
  } catch {
    /* categories optional */
  }
  const weight = item.weight ? Number(item.weight) : NaN;
  const img = item.image_url || item.thumbnail_url;
  const imageUrl = img
    ? img.startsWith("http")
      ? img
      : `https:${img}`
    : bricklinkImageUrl(itemType, usedNo);
  return {
    itemNo: usedNo,
    itemType,
    name: decodeEntities(item.name ?? usedNo),
    year: item.year_released ?? null,
    category: category ? decodeEntities(category) : null,
    subCategory: subCategory ? decodeEntities(subCategory) : null,
    weightGrams: Number.isFinite(weight) ? weight : null,
    imageUrl,
  };
}

export async function fetchBricklinkPriceGuide(
  creds: BricklinkCreds,
  itemType: ItemType,
  itemNo: string,
  opts: { newOrUsed: "N" | "U"; guideType?: "sold" | "stock"; currency?: string },
): Promise<BricklinkPriceBand | null> {
  const type = bricklinkItemType(itemType);
  const guideType = opts.guideType ?? "stock";
  const params = new URLSearchParams({
    guide_type: guideType,
    new_or_used: opts.newOrUsed,
  });
  if (opts.currency) params.set("currency_code", opts.currency);
  const qs = params.toString();
  for (const no of bricklinkItemCandidates(itemType, itemNo)) {
    try {
      const data = await blFetch<Parameters<typeof parseBricklinkPriceGuide>[0]>(
        "GET",
        `/items/${type}/${encodeURIComponent(no)}/price?${qs}`,
        creds,
      );
      const parsed = parseBricklinkPriceGuide(data, guideType);
      if (parsed) return parsed;
    } catch {
      /* try next candidate or stock */
    }
  }
  return null;
}

export async function fetchBricklinkGuides(
  creds: BricklinkCreds,
  itemType: ItemType,
  itemNo: string,
  currency: string,
): Promise<{ used: BricklinkPriceBand | null; neu: BricklinkPriceBand | null }> {
  const load = async (newOrUsed: "N" | "U") =>
    fetchBricklinkPriceGuide(creds, itemType, itemNo, {
      newOrUsed,
      guideType: "stock",
      currency,
    });
  const [used, neu] = await Promise.all([load("U"), load("N")]);
  return { used, neu };
}

type BlOrder = {
  order_id?: number | string;
  date_ordered?: string;
  date_status_changed?: string;
  buyer_name?: string;
  buyer_email?: string;
  status?: string;
  payment_method?: string;
  remarks?: string;
  total_count?: number;
  unique_count?: number;
  shipping?: {
    method?: string;
    address?: {
      name?: unknown;
      full?: string;
      address1?: string;
      address2?: string;
      city?: string;
      state?: string;
      postal_code?: string;
      country_code?: string;
      phone_number?: string;
    };
  };
  cost?: {
    currency_code?: string;
    grand_total?: string | number;
    subtotal?: string | number;
    shipping?: string | number;
  };
};

function moneyNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function textOf(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v).trim();
  if (Array.isArray(v)) return v.map(textOf).filter(Boolean).join(" ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return textOf(o.full || o.name || [o.first, o.last].filter(Boolean).join(" ") || o.value || o.text);
  }
  return "";
}

export async function listBricklinkOrders(creds: BricklinkCreds): Promise<SaleOrder[]> {
  const status =
    "pending,updated,processing,ready,paid,packed,shipped,received,completed";
  let rows = (await blFetch<BlOrder[]>("GET", `/orders?direction=in&status=${status}`, creds)) ?? [];
  if (rows.length === 0) {
    rows = (await blFetch<BlOrder[]>("GET", "/orders?direction=in", creds)) ?? [];
  }
  return rows
    .filter((row) => !/purged|cancelled|canceled/i.test(String(row.status ?? "")))
    .map((row) => summaryFromBl(row))
    .filter((o) => o.id)
    .sort((a, b) => {
      const da = new Date(a.createdAt).getTime() || 0;
      const db = new Date(b.createdAt).getTime() || 0;
      return db - da;
    })
    .slice(0, 40);
}

function summaryFromBl(row: BlOrder): SaleOrder {
  const id = String(row.order_id ?? "");
  return {
    id,
    channel: "bricklink",
    status: row.status || "Unknown",
    createdAt: row.date_ordered || "",
    buyer: row.buyer_name || "BrickLink buyer",
    total: moneyNum(row.cost?.grand_total) ?? moneyNum(row.cost?.subtotal),
    currency: (row.cost?.currency_code || "GBP").toUpperCase(),
    itemCount: Number(row.total_count) || Number(row.unique_count) || 1,
    items: [],
    url: `https://www.bricklink.com/orderDetail.asp?ID=${encodeURIComponent(id)}`,
    pulled: false,
  };
}

export async function fetchBricklinkOrder(creds: BricklinkCreds, orderId: string): Promise<SaleOrderDetail> {
  const id = orderId.trim();
  if (!id) throw new Error("Missing BrickLink order id.");
  const row = await blFetch<BlOrder>("GET", `/orders/${encodeURIComponent(id)}`, creds);
  if (!row) throw new Error("BrickLink order not found.");
  let items: SaleLine[] = [];
  try {
    const raw = await blFetch<unknown>("GET", `/orders/${encodeURIComponent(id)}/items`, creds);
    items = mapBlItems(flattenOrderItems(raw));
  } catch {
    items = [];
  }
  const summary = summaryFromBl(row);
  const addr = row.shipping?.address;
  const name = decodeEntities(textOf(addr?.name) || textOf(addr?.full));
  const line1 = decodeEntities(textOf(addr?.address1));
  const line2 = decodeEntities(textOf(addr?.address2));
  const city = decodeEntities(textOf(addr?.city));
  const region = decodeEntities(textOf(addr?.state));
  const postal = decodeEntities(textOf(addr?.postal_code));
  const country = decodeEntities(textOf(addr?.country_code));
  const hasAddr = Boolean(name || line1 || city || postal);
  return {
    ...summary,
    buyer: textOf(row.buyer_name) || summary.buyer,
    items,
    itemCount: items.reduce((n, it) => n + it.qty, 0) || summary.itemCount,
    email: textOf(row.buyer_email) || null,
    phone: textOf(addr?.phone_number) || null,
    payment: textOf(row.payment_method) || null,
    shippingMethod: textOf(row.shipping?.method) || null,
    shippingCost: moneyNum(row.cost?.shipping),
    subtotal: moneyNum(row.cost?.subtotal),
    remarks: textOf(row.remarks) ? decodeEntities(textOf(row.remarks)) : null,
    address: hasAddr
      ? { name, line1, line2, city, region, postal, country }
      : null,
    paidAt: /paid|packed|shipped|completed/i.test(String(row.status)) ? row.date_status_changed || null : null,
    shippedAt: /shipped|completed|received/i.test(String(row.status)) ? row.date_status_changed || null : null,
    postage: null,
  };
}
