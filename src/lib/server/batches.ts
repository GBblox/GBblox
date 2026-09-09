import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { ownerMiddleware } from "@/lib/owner-middleware";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { assertBatchValid, normalizePostcode } from "@/lib/batch-rules";
import type { PurchaseBatch } from "@/lib/types";

export const BATCH_PLATFORMS = [
  { value: "gumtree", label: "Gumtree" },
  { value: "facebook", label: "Facebook Marketplace" },
  { value: "ebay", label: "eBay" },
] as const;

export const BATCH_PAYMENTS = [
  { value: "cash", label: "Cash" },
  { value: "paypal", label: "PayPal" },
  { value: "stripe", label: "Stripe" },
  { value: "ebay_payments", label: "eBay Payments" },
] as const;

type BatchRow = {
  id: number;
  batch_number: string;
  purchased_on: string;
  platform: string;
  payment_method: string;
  order_number: string | null;
  seller_name: string | null;
  seller_line1: string | null;
  seller_line2: string | null;
  seller_city: string | null;
  seller_region: string | null;
  seller_postal: string | null;
  seller_country: string | null;
  price: string | number | null;
  currency: string;
  created_at: string | Date;
  updated_at: string | Date;
};

function mapBatch(row: BatchRow): PurchaseBatch {
  const price = row.price == null || row.price === "" ? null : Number(row.price);
  return {
    id: row.id,
    batchNumber: row.batch_number,
    purchasedOn: String(row.purchased_on).slice(0, 10),
    platform: row.platform as PurchaseBatch["platform"],
    paymentMethod: row.payment_method as PurchaseBatch["paymentMethod"],
    orderNumber: row.order_number ?? "",
    sellerName: row.seller_name ?? "",
    sellerLine1: row.seller_line1 ?? "",
    sellerLine2: row.seller_line2 ?? "",
    sellerCity: row.seller_city ?? "",
    sellerRegion: row.seller_region ?? "",
    sellerPostal: row.seller_postal ?? "",
    sellerCountry: row.seller_country ?? "GB",
    price: Number.isFinite(price) ? price : null,
    currency: row.currency || "GBP",
    createdAt: typeof row.created_at === "string" ? row.created_at : row.created_at.toISOString(),
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : row.updated_at.toISOString(),
  };
}

async function ensureBatchesTable() {
  const sql = await getSql();
  await sql.query(`
    create table if not exists purchase_batches (
      id serial primary key,
      batch_number text not null unique,
      purchased_on date not null default current_date,
      platform text not null,
      payment_method text not null,
      order_number text not null default '',
      seller_name text not null default '',
      seller_line1 text not null default '',
      seller_line2 text not null default '',
      seller_city text not null default '',
      seller_region text not null default '',
      seller_postal text not null default '',
      seller_country text not null default 'GB',
      price numeric,
      currency text not null default 'GBP',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await sql.query("alter table lego_sets add column if not exists batch_number text not null default ''");
}

export function formatBatchNumber(n: number): string {
  return `BAT-${String(n).padStart(3, "0")}`;
}

export const nextBatchNumber = createServerFn({ method: "GET" }).middleware([authMiddleware, ownerMiddleware]).handler(async () => {
  const sql = await getSql();
  await ensureBatchesTable();
  const rows = await sql<{ batch_number: string }>`select batch_number from purchase_batches`;
  let max = 0;
  for (const row of rows ?? []) {
    const match = /^BAT-(\d+)$/i.exec(row.batch_number.trim());
    if (!match) continue;
    const n = Number(match[1]);
    if (n > max) max = n;
  }
  return formatBatchNumber(max + 1);
});

export const listBatches = createServerFn({ method: "GET" }).middleware([authMiddleware, ownerMiddleware]).handler(async () => {
  const sql = await getSql();
  await ensureBatchesTable();
  const rows = await sql<BatchRow>`
    select * from purchase_batches
    order by purchased_on desc, id desc
  `;
  return (rows ?? []).map(mapBatch);
});

export const createBatch = createServerFn({ method: "POST" }).middleware([authMiddleware, ownerMiddleware])
  .validator(
    z.object({
      purchasedOn: z.string().min(8).max(10),
      platform: z.enum(["gumtree", "facebook", "ebay"]),
      paymentMethod: z.enum(["cash", "paypal", "stripe", "ebay_payments"]),
      orderNumber: z.string().max(80).optional().default(""),
      sellerName: z.string().min(1).max(120),
      sellerLine1: z.string().min(1).max(120),
      sellerLine2: z.string().max(120).optional().default(""),
      sellerCity: z.string().min(1).max(80),
      sellerRegion: z.string().max(80).optional().default(""),
      sellerPostal: z.string().min(1).max(20),
      sellerCountry: z.string().max(40).optional().default("GB"),
      price: z.number().finite().min(0),
    }),
  )
  .handler(async ({ data }) => {
    const sql = await getSql();
    await ensureBatchesTable();
    assertBatchValid({
      purchasedOn: data.purchasedOn,
      platform: data.platform,
      paymentMethod: data.paymentMethod,
      orderNumber: data.orderNumber,
      sellerName: data.sellerName,
      sellerLine1: data.sellerLine1,
      sellerCity: data.sellerCity,
      sellerPostal: data.sellerPostal,
      sellerCountry: data.sellerCountry,
      price: data.price,
    });
    const existing = await sql<{ batch_number: string }>`select batch_number from purchase_batches`;
    let max = 0;
    for (const row of existing ?? []) {
      const match = /^BAT-(\d+)$/i.exec(row.batch_number.trim());
      if (!match) continue;
      const n = Number(match[1]);
      if (n > max) max = n;
    }
    const batchNumber = formatBatchNumber(max + 1);
    const rows = await sql<BatchRow>`
      insert into purchase_batches (
        batch_number, purchased_on, platform, payment_method, order_number,
        seller_name, seller_line1, seller_line2, seller_city, seller_region, seller_postal, seller_country,
        price, currency
      ) values (
        ${batchNumber}, ${data.purchasedOn}, ${data.platform}, ${data.paymentMethod}, ${data.orderNumber.trim()},
        ${data.sellerName.trim()}, ${data.sellerLine1.trim()}, ${data.sellerLine2.trim()},
        ${data.sellerCity.trim()}, ${data.sellerRegion.trim()}, ${normalizePostcode(data.sellerPostal)},
        ${data.sellerCountry.trim() || "GB"},
        ${data.price}, ${"GBP"}
      )
      returning *
    `;
    return mapBatch(rows[0]);
  });

const batchFields = {
  purchasedOn: z.string().min(8).max(10),
  platform: z.enum(["gumtree", "facebook", "ebay"]),
  paymentMethod: z.enum(["cash", "paypal", "stripe", "ebay_payments"]),
  orderNumber: z.string().max(80).optional().default(""),
  sellerName: z.string().min(1).max(120),
  sellerLine1: z.string().min(1).max(120),
  sellerLine2: z.string().max(120).optional().default(""),
  sellerCity: z.string().min(1).max(80),
  sellerRegion: z.string().max(80).optional().default(""),
  sellerPostal: z.string().min(1).max(20),
  sellerCountry: z.string().max(40).optional().default("GB"),
  price: z.number().finite().min(0),
};

export const updateBatch = createServerFn({ method: "POST" }).middleware([authMiddleware, ownerMiddleware])
  .validator(z.object({ id: z.number().int(), ...batchFields }))
  .handler(async ({ data }) => {
    const sql = await getSql();
    await ensureBatchesTable();
    assertBatchValid({
      purchasedOn: data.purchasedOn,
      platform: data.platform,
      paymentMethod: data.paymentMethod,
      orderNumber: data.orderNumber,
      sellerName: data.sellerName,
      sellerLine1: data.sellerLine1,
      sellerCity: data.sellerCity,
      sellerPostal: data.sellerPostal,
      sellerCountry: data.sellerCountry,
      price: data.price,
    });
    const rows = await sql<BatchRow>`
      update purchase_batches
      set purchased_on = ${data.purchasedOn},
          platform = ${data.platform},
          payment_method = ${data.paymentMethod},
          order_number = ${data.orderNumber.trim()},
          seller_name = ${data.sellerName.trim()},
          seller_line1 = ${data.sellerLine1.trim()},
          seller_line2 = ${data.sellerLine2.trim()},
          seller_city = ${data.sellerCity.trim()},
          seller_region = ${data.sellerRegion.trim()},
          seller_postal = ${normalizePostcode(data.sellerPostal)},
          seller_country = ${data.sellerCountry.trim() || "GB"},
          price = ${data.price},
          updated_at = now()
      where id = ${data.id}
      returning *
    `;
    if (!rows[0]) throw new Error("Batch not found.");
    return mapBatch(rows[0]);
  });

export const deleteBatch = createServerFn({ method: "POST" }).middleware([authMiddleware, ownerMiddleware])
  .validator(z.object({ id: z.number().int(), batchNumber: z.string().min(1) }))
  .handler(async ({ data }) => {
    const sql = await getSql();
    await ensureBatchesTable();
    await sql`update lego_sets set batch_number = ${""} where batch_number = ${data.batchNumber}`;
    const rows = await sql`delete from purchase_batches where id = ${data.id} returning id`;
    if (!rows[0]) throw new Error("Batch not found.");
    return { ok: true as const };
  });
