import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { ownerMiddleware } from "@/lib/owner-middleware";
import { z } from "zod";
import { listBricklinkOrders, bricklinkCredsFrom, fetchBricklinkOrder } from "@/lib/bricklink-store";
import { getSql } from "@/lib/db";
import { fetchEbayOrder, listEbaySoldOrders } from "@/lib/ebay";
import { marketplaceOf } from "@/lib/format";
import { applySoldOrders, applySoldSale, isPaidSale, saleLineSkus } from "@/lib/sold-sync";
import type { MarketplaceId, SaleAddress, SaleChannel, SaleLine, SaleOrder, SaleOrderDetail, SalesResult } from "@/lib/types";

const credsSchema = z.object({
  ebayUserToken: z.string().optional().default(""),
  blConsumerKey: z.string().optional().default(""),
  blConsumerSecret: z.string().optional().default(""),
  blToken: z.string().optional().default(""),
  blTokenSecret: z.string().optional().default(""),
  marketplace: z
    .enum(["EBAY_US", "EBAY_GB", "EBAY_AU", "EBAY_CA", "EBAY_DE"])
    .optional()
    .default("EBAY_GB"),
});

type SaleRow = {
  channel: string;
  remote_id: string;
  status: string;
  created_at_remote: string | null;
  buyer: string;
  email: string | null;
  phone: string | null;
  payment: string | null;
  shipping_method: string | null;
  shipping_cost: string | number | null;
  subtotal: string | number | null;
  total: string | number | null;
  currency: string;
  item_count: number;
  remarks: string | null;
  address_json: string | null;
  items_json: string | null;
  paid_at: string | null;
  shipped_at: string | null;
  url: string | null;
  rm_order_id?: string | null;
  rm_tracking?: string | null;
  rm_service?: string | null;
  rm_label_pdf?: string | null;
  rm_label_at?: string | Date | null;
};

function num(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function keyOf(channel: string, id: string): string {
  return `${channel}:${id}`;
}

function mapStored(row: SaleRow): SaleOrderDetail {
  return {
    id: row.remote_id,
    channel: row.channel === "ebay" ? "ebay" : "bricklink",
    status: row.status,
    createdAt: row.created_at_remote || "",
    buyer: row.buyer,
    total: num(row.total),
    currency: row.currency || "GBP",
    itemCount: row.item_count || 0,
    items: parseJson<SaleLine[]>(row.items_json, []),
    url: row.url || "",
    pulled: true,
    email: row.email,
    phone: row.phone,
    payment: row.payment,
    shippingMethod: row.shipping_method,
    shippingCost: num(row.shipping_cost),
    subtotal: num(row.subtotal),
    remarks: row.remarks,
    address: parseJson<SaleAddress | null>(row.address_json, null),
    paidAt: row.paid_at,
    shippedAt: row.shipped_at,
    postage: row.rm_order_id
      ? {
          orderIdentifier: row.rm_order_id,
          trackingNumber: row.rm_tracking ?? null,
          serviceCode: row.rm_service || "",
          labelPdf: row.rm_label_pdf ?? null,
          createdAt: row.rm_label_at ? String(row.rm_label_at) : null,
        }
      : null,
  };
}

function sortSales<T extends { createdAt: string }>(orders: T[]): T[] {
  return [...orders].sort((a, b) => {
    const da = new Date(a.createdAt).getTime() || 0;
    const db = new Date(b.createdAt).getTime() || 0;
    return db - da;
  });
}

async function listStored(): Promise<SaleOrderDetail[]> {
  const sql = await getSql();
  const rows = await sql<SaleRow>`select * from sales order by pulled_at desc`;
  return rows.map(mapStored);
}

async function saveSale(detail: SaleOrderDetail): Promise<void> {
  const sql = await getSql();
  const itemsJson = JSON.stringify(detail.items);
  const addressJson = detail.address ? JSON.stringify(detail.address) : null;
  await sql`
    insert into sales (
      channel, remote_id, status, created_at_remote, buyer, email, phone, payment,
      shipping_method, shipping_cost, subtotal, total, currency, item_count, remarks,
      address_json, items_json, paid_at, shipped_at, url, pulled_at
    ) values (
      ${detail.channel}, ${detail.id}, ${detail.status}, ${detail.createdAt || null},
      ${detail.buyer}, ${detail.email}, ${detail.phone}, ${detail.payment},
      ${detail.shippingMethod}, ${detail.shippingCost}, ${detail.subtotal}, ${detail.total},
      ${detail.currency}, ${detail.itemCount}, ${detail.remarks},
      ${addressJson}, ${itemsJson}, ${detail.paidAt}, ${detail.shippedAt}, ${detail.url || null}, now()
    )
    on conflict (channel, remote_id) do update set
      status = excluded.status,
      created_at_remote = excluded.created_at_remote,
      buyer = excluded.buyer,
      email = excluded.email,
      phone = excluded.phone,
      payment = excluded.payment,
      shipping_method = excluded.shipping_method,
      shipping_cost = excluded.shipping_cost,
      subtotal = excluded.subtotal,
      total = excluded.total,
      currency = excluded.currency,
      item_count = excluded.item_count,
      remarks = excluded.remarks,
      address_json = excluded.address_json,
      items_json = excluded.items_json,
      paid_at = excluded.paid_at,
      shipped_at = excluded.shipped_at,
      url = excluded.url,
      pulled_at = now()
  `;
}

export const listSales = createServerFn({ method: "POST" }).middleware([authMiddleware, ownerMiddleware])
  .validator(credsSchema)
  .handler(async ({ data }): Promise<SalesResult> => {
    const warnings: string[] = [];
    const live: SaleOrder[] = [];
    const token = data.ebayUserToken.trim();
    const bl = bricklinkCredsFrom(data);
    const market = marketplaceOf((data.marketplace as MarketplaceId) || "EBAY_GB");

    const jobs: Promise<void>[] = [];
    if (token) {
      jobs.push(
        listEbaySoldOrders(token, market.siteId, market.id).then(
          (rows) => {
            live.push(...rows);
          },
          (err) => {
            warnings.push(err instanceof Error ? err.message : "eBay orders failed.");
          },
        ),
      );
    }
    if (bl) {
      jobs.push(
        listBricklinkOrders(bl).then(
          (rows) => {
            live.push(...rows);
          },
          (err) => {
            warnings.push(err instanceof Error ? err.message : "BrickLink orders failed.");
          },
        ),
      );
    }
    const stored = await listStored().catch(() => [] as SaleOrderDetail[]);
    if (jobs.length === 0 && stored.length === 0) {
      return { orders: [], warnings: ["Add eBay or BrickLink keys in Settings to load sales."] };
    }
    await Promise.all(jobs);
    const storedMap = new Map(stored.map((s) => [keyOf(s.channel, s.id), s]));
    const merged: SaleOrder[] = live.map((o) => {
      const hit = storedMap.get(keyOf(o.channel, o.id));
      if (!hit) return { ...o, pulled: false };
      storedMap.delete(keyOf(o.channel, o.id));
      return { ...o, pulled: true, items: hit.items.length ? hit.items : o.items };
    });
    for (const leftover of storedMap.values()) merged.push(leftover);

    const creds = {
      ebayUserToken: token,
      marketplace: market.id,
      blConsumerKey: data.blConsumerKey,
      blConsumerSecret: data.blConsumerSecret,
      blToken: data.blToken,
      blTokenSecret: data.blTokenSecret,
    };
    if (bl) {
      for (const order of merged) {
        if (order.channel !== "bricklink" || !isPaidSale("bricklink", order.status)) continue;
        if (saleLineSkus(order.items).length) continue;
        try {
          const detail = await fetchBricklinkOrder(bl, order.id);
          order.items = detail.items;
          order.itemCount = detail.itemCount;
          order.pulled = true;
          await saveSale({ ...detail, pulled: true });
        } catch (err) {
          warnings.push(
            `#${order.id}: ${err instanceof Error ? err.message : "Could not pull BrickLink items"}`,
          );
        }
      }
    }
    warnings.push(...(await applySoldOrders(merged, creds)));
    return { orders: sortSales(merged), warnings };
  });

export const getSaleOrder = createServerFn({ method: "POST" }).middleware([authMiddleware, ownerMiddleware])
  .validator(
    credsSchema.extend({
      channel: z.enum(["ebay", "bricklink"]),
      id: z.string().min(1),
      refresh: z.boolean().optional().default(true),
    }),
  )
  .handler(async ({ data }): Promise<SaleOrderDetail> => {
    const channel = data.channel as SaleChannel;
    const id = data.id.trim();
    if (!data.refresh) {
      const stored = (await listStored()).find((s) => s.channel === channel && s.id === id);
      const stale =
        stored &&
        stored.channel === "bricklink" &&
        (stored.items.length === 0 || stored.items.every((it) => it.title === "BrickLink item" || !it.itemNo));
      if (stored && !stale) {
        await applySoldSale(stored, data).catch(() => null);
        return stored;
      }
    }
    let detail: SaleOrderDetail;
    if (channel === "bricklink") {
      const bl = bricklinkCredsFrom(data);
      if (!bl) throw new Error("Add BrickLink API keys in Settings to load this order.");
      detail = await fetchBricklinkOrder(bl, id);
    } else {
      const token = data.ebayUserToken.trim();
      if (!token) throw new Error("Add an eBay user token in Settings to load this order.");
      const market = marketplaceOf((data.marketplace as MarketplaceId) || "EBAY_GB");
      detail = await fetchEbayOrder(token, market.siteId, market.id, id);
    }
    detail = { ...detail, pulled: true };
    await saveSale(detail);
    await applySoldSale(detail, data);
    const stored = (await listStored()).find((s) => s.channel === channel && s.id === id);
    return { ...detail, postage: stored?.postage ?? null };
  });
