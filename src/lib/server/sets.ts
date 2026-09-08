import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { credsFromSettings, enrichCatalogHit, searchCatalog } from "@/lib/catalog";
import {
  bricklinkCredsFrom,
  createBricklinkLot,
  findBricklinkBySku,
  listBricklinkInventories,
  matchBricklinkLot,
  testBricklinkCreds,
} from "@/lib/bricklink-store";
import { composeListing, fileExchangeRow, listActiveEbayBySku, lookupEbayBySku, publishToEbay } from "@/lib/ebay";
import { isBatchNumber } from "@/lib/batch-rules";
import { getSql } from "@/lib/db";
import { marketplaceOf, normalizeLocation, isValidLocation } from "@/lib/format";
import { fetchMarketPrice } from "@/lib/prices";
import { parseInventoryCsv } from "@/lib/csv";
import { DEMO_LOTS, demoImageUrl } from "@/lib/demo-catalog";
import {
  formatSku,
  isValidSku,
  looksLikeAutoSku,
  nextSequence,
  normalizeSku,
  skuPrefix,
} from "@/lib/sku";
import type { CatalogHit, ChannelStatus, Condition, Inclusion, ItemType, LegoSet, MarketplaceId, Status } from "@/lib/types";

type Row = {
  id: number;
  item_type: string | null;
  set_num: string;
  sku: string | null;
  location: string | null;
  name: string;
  year: number | null;
  theme: string | null;
  theme_id: number | null;
  category: string | null;
  sub_category: string | null;
  weight_grams: string | number | null;
  num_parts: number | null;
  image_url: string | null;
  condition: string;
  comes_with_instructions: string | null;
  comes_with_box: string | null;
  qty: number;
  asking_price: string | number | null;
  currency: string;
  used_price: string | number | null;
  used_price_min: string | number | null;
  used_price_max: string | number | null;
  used_price_source: string | null;
  used_price_at: string | Date | null;
  new_price: string | number | null;
  new_price_min: string | number | null;
  new_price_max: string | number | null;
  retail_price: string | number | null;
  notes: string;
  status: string;
  ebay_item_id: string | null;
  ebay_listing_url: string | null;
  ebay_title: string | null;
  ebay_listed: boolean | null;
  ebay_listing_status: string | null;
  ebay_synced_at: string | Date | null;
  bl_listed: boolean | null;
  bl_inventory_id: string | null;
  bl_listing_url: string | null;
  bl_listing_status: string | null;
  bl_synced_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  extra_photos?: string | null;
  batch_number?: string | null;
};

function num(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function iso(v: string | Date | null | undefined): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  return v.toISOString();
}

function asChannel(v: string | null | undefined, listed?: boolean | null): ChannelStatus {
  if (v === "listed" || v === "not_listed" || v === "ended" || v === "unknown") return v;
  if (listed) return "listed";
  return "unknown";
}

function asItemType(v: string | null | undefined): ItemType {
  return v === "minifig" ? "minifig" : "set";
}

function asInclusion(v: string | null | undefined): Inclusion {
  return v === "yes" || v === "no" ? v : "na";
}

function cleanLocation(raw: string | null | undefined): string {
  const loc = normalizeLocation(raw ?? "");
  if (!isValidLocation(loc)) {
    throw new Error("Location must use printable characters so it can print as a barcode.");
  }
  return loc;
}

async function ensureExtraPhotosColumn() {
  const sql = await getSql();
  await sql.query(
    "alter table lego_sets add column if not exists extra_photos text not null default '[]'",
  );
}

async function ensureBatchColumn() {
  const sql = await getSql();
  await sql.query("alter table lego_sets add column if not exists batch_number text not null default ''");
}

async function requireBatchNumber(raw: string): Promise<string> {
  const value = raw.trim().toUpperCase();
  if (!value) return "";
  if (!isBatchNumber(value)) throw new Error("Batch number must look like BAT-001.");
  const sql = await getSql();
  const rows = await sql<{ batch_number: string }>`
    select batch_number from purchase_batches where upper(batch_number) = ${value}
  `;
  if (!rows[0]) throw new Error(`Batch ${value} does not exist.`);
  return rows[0].batch_number;
}

function parsePhotos(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is string => typeof p === "string" && p.startsWith("data:image"));
  } catch {
    return [];
  }
}

function mapSet(row: Row): LegoSet {
  return {
    id: row.id,
    itemType: asItemType(row.item_type),
    setNum: row.set_num,
    sku: row.sku || formatSku(row.set_num, asItemType(row.item_type), row.id),
    location: row.location ?? "",
    name: row.name,
    year: row.year,
    theme: row.theme,
    themeId: row.theme_id,
    category: row.category,
    subCategory: row.sub_category,
    weightGrams: num(row.weight_grams),
    numParts: row.num_parts,
    imageUrl: row.image_url,
    extraPhotos: parsePhotos(row.extra_photos),
    batchNumber: row.batch_number ?? "",
    condition: row.condition as Condition,
    comesWithInstructions: asInclusion(row.comes_with_instructions),
    comesWithBox: asInclusion(row.comes_with_box),
    qty: row.qty,
    askingPrice: num(row.asking_price),
    currency: row.currency,
    usedPrice: num(row.used_price),
    usedPriceMin: num(row.used_price_min),
    usedPriceMax: num(row.used_price_max),
    usedPriceSource: row.used_price_source,
    usedPriceAt: iso(row.used_price_at),
    newPrice: num(row.new_price),
    newPriceMin: num(row.new_price_min),
    newPriceMax: num(row.new_price_max),
    retailPrice: num(row.retail_price),
    notes: row.notes ?? "",
    status: row.status as Status,
    ebayItemId: row.ebay_item_id,
    ebayListingUrl: row.ebay_listing_url,
    ebayTitle: row.ebay_title,
    ebayListed: Boolean(row.ebay_listed),
    ebayListingStatus: asChannel(row.ebay_listing_status, row.ebay_listed),
    ebaySyncedAt: iso(row.ebay_synced_at),
    blListed: Boolean(row.bl_listed),
    blInventoryId: row.bl_inventory_id,
    blListingUrl: row.bl_listing_url,
    blListingStatus: asChannel(row.bl_listing_status, row.bl_listed),
    blSyncedAt: iso(row.bl_synced_at),
    createdAt: iso(row.created_at) ?? "",
    updatedAt: iso(row.updated_at) ?? "",
  };
}

const settingsSchema = z.object({
  rebrickableApiKey: z.string().optional().default(""),
  ebayClientId: z.string().optional().default(""),
  ebayClientSecret: z.string().optional().default(""),
  ebayUserToken: z.string().optional().default(""),
  blConsumerKey: z.string().optional().default(""),
  blConsumerSecret: z.string().optional().default(""),
  blToken: z.string().optional().default(""),
  blTokenSecret: z.string().optional().default(""),
  marketplace: z
    .enum(["EBAY_US", "EBAY_GB", "EBAY_AU", "EBAY_CA", "EBAY_DE"])
    .optional()
    .default("EBAY_GB"),
  postalCode: z.string().optional().default(""),
  city: z.string().optional().default(""),
  shippingCost: z.string().optional().default("0"),
  handlingDays: z.string().optional().default("1"),
  royalMailApiKey: z.string().optional().default(""),
  royalMailSenderName: z.string().optional().default(""),
});

const inclusionEnum = z.enum(["yes", "no", "na"]);

const catalogFields = {
  itemType: z.enum(["set", "minifig"]).optional().default("set"),
  name: z.string().min(1).max(200),
  year: z.number().int().nullable().optional(),
  theme: z.string().max(80).nullable().optional(),
  themeId: z.number().int().nullable().optional(),
  category: z.string().max(80).nullable().optional(),
  subCategory: z.string().max(80).nullable().optional(),
  weightGrams: z.number().finite().nullable().optional(),
  numParts: z.number().int().nullable().optional(),
  imageUrl: z.string().max(500).nullable().optional(),
};

async function nextAutoSku(setNum: string, itemType: ItemType, exceptId?: number): Promise<string> {
  const sql = await getSql();
  const prefix = skuPrefix(setNum, itemType);
  const rows = exceptId
    ? await sql<{ sku: string | null }>`
        select sku from lego_sets
        where upper(coalesce(sku, '')) like ${`${prefix}%`}
          and id <> ${exceptId}
      `
    : await sql<{ sku: string | null }>`
        select sku from lego_sets
        where upper(coalesce(sku, '')) like ${`${prefix}%`}
      `;
  const seq = nextSequence(
    rows.map((r) => r.sku ?? ""),
    prefix,
  );
  return formatSku(setNum, itemType, seq);
}

async function assignSku(
  preferred: string | undefined,
  setNum: string,
  itemType: ItemType = "set",
  exceptId?: number,
): Promise<string> {
  const sql = await getSql();
  const free = async (sku: string) => {
    const rows = exceptId
      ? await sql<{ id: number }>`select id from lego_sets where sku = ${sku} and id <> ${exceptId}`
      : await sql<{ id: number }>`select id from lego_sets where sku = ${sku}`;
    return rows.length === 0;
  };
  if (preferred?.trim()) {
    const sku = normalizeSku(preferred);
    if (!isValidSku(sku)) throw new Error("SKU must be 3–50 letters, numbers, dots or dashes.");
    if (await free(sku)) return sku;
    if (looksLikeAutoSku(sku, setNum, itemType)) {
      return nextAutoSku(setNum, itemType, exceptId);
    }
    throw new Error(`SKU ${sku} is already used.`);
  }
  return nextAutoSku(setNum, itemType, exceptId);
}

export const listSets = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  try {
    await ensureExtraPhotosColumn();
    await ensureBatchColumn();
  } catch {
    /* column may already exist */
  }
  const rows = await sql<Row>`
    select * from lego_sets
    order by created_at desc, id desc
  `;
  return (rows ?? []).map((row) => mapSet(row));
});

export const lookupSet = createServerFn({ method: "POST" })
  .validator(
    z.object({
      query: z.string().min(1).max(80),
      apiKey: z.string().optional(),
      itemType: z.enum(["set", "minifig", "all"]).optional().default("all"),
      settings: settingsSchema.optional(),
    }),
  )
  .handler(async ({ data }) => {
    return searchCatalog(data.query, {
      apiKey: data.apiKey,
      itemType: data.itemType,
      blCreds: credsFromSettings(data.settings),
    });
  });

export const nextSku = createServerFn({ method: "POST" })
  .validator(
    z.object({
      setNum: z.string().min(1).max(40),
      itemType: z.enum(["set", "minifig"]).optional().default("set"),
    }),
  )
  .handler(async ({ data }) => {
    return nextAutoSku(data.setNum, data.itemType ?? "set");
  });

export const fetchCatalogDetails = createServerFn({ method: "POST" })
  .validator(
    z.object({
      setNum: z.string().min(1).max(40),
      itemType: z.enum(["set", "minifig"]).optional().default("set"),
      settings: settingsSchema.optional(),
    }),
  )
  .handler(async ({ data }) => {
    const creds = credsFromSettings(data.settings);
    const hits = await searchCatalog(data.setNum, { itemType: data.itemType, blCreds: creds });
    const hit: CatalogHit =
      hits.find(
        (h) => h.itemType === data.itemType && h.setNum.toLowerCase() === data.setNum.toLowerCase(),
      ) ??
      hits.find((h) => h.setNum.toLowerCase() === data.setNum.toLowerCase()) ??
      hits.find((h) => h.setNum.toLowerCase() === `${data.setNum.toLowerCase()}-1`) ??
      hits[0] ?? {
        itemType: data.itemType,
        setNum: data.setNum,
        name: data.setNum,
        year: null,
        theme: data.itemType === "minifig" ? "Minifigures" : null,
        themeId: null,
        category: data.itemType === "minifig" ? "Minifigures" : null,
        subCategory: null,
        weightGrams: null,
        numParts: null,
        imageUrl: null,
        rebrickableUrl:
          data.itemType === "minifig"
            ? `https://rebrickable.com/minifigs/${data.setNum}/`
            : `https://rebrickable.com/sets/${data.setNum}/`,
        retailPrice: null,
      };
    if (hit.weightGrams != null && hit.category && hit.itemType === data.itemType) {
      return { ...hit, itemType: data.itemType };
    }
    return enrichCatalogHit({ ...hit, itemType: data.itemType }, creds);
  });

export const addSet = createServerFn({ method: "POST" })
  .validator(
    z.object({
      setNum: z.string().min(1).max(40),
      sku: z.string().max(50).optional(),
      location: z.string().max(40).optional(),
      ...catalogFields,
      condition: z
        .enum(["used_complete", "used_incomplete", "used_parts", "new_sealed", "new_opened"])
        .optional()
        .default("used_complete"),
      comesWithInstructions: inclusionEnum.optional(),
      comesWithBox: inclusionEnum.optional(),
      qty: z.number().int().min(1).max(99).optional().default(1),
      askingPrice: z.number().finite().nullable().optional(),
      currency: z.string().max(8).optional().default("GBP"),
      notes: z.string().max(2000).optional().default(""),
      extraPhotos: z.array(z.string().max(2_000_000)).max(6).optional().default([]),
      batchNumber: z.string().max(20).optional().default(""),
    }),
  )
  .handler(async ({ data }) => {
    const sql = await getSql();
    await ensureExtraPhotosColumn();
    await ensureBatchColumn();
    const itemType = asItemType(data.itemType);
    const inclusionDefault = itemType === "minifig" ? "na" : "no";
    const comesWithInstructions = data.comesWithInstructions ?? inclusionDefault;
    const comesWithBox = data.comesWithBox ?? inclusionDefault;
    const sku = await assignSku(data.sku, data.setNum, itemType);
    const location = cleanLocation(data.location);
    const status = "for_sale";
    const rows = await sql<Row>`
      insert into lego_sets (
        item_type, set_num, sku, location, name, year, theme, theme_id, category, sub_category, weight_grams,
        num_parts, image_url, condition, comes_with_instructions, comes_with_box, qty, asking_price, currency, notes, status, extra_photos, batch_number
      ) values (
        ${itemType}, ${data.setNum}, ${sku}, ${location}, ${data.name}, ${data.year ?? null}, ${data.theme ?? null},
        ${data.themeId ?? null}, ${data.category ?? null}, ${data.subCategory ?? null},
        ${data.weightGrams ?? null}, ${data.numParts ?? null}, ${data.imageUrl ?? null},
        ${data.condition}, ${comesWithInstructions}, ${comesWithBox}, ${data.qty}, ${data.askingPrice ?? null},
        ${data.currency}, ${data.notes}, ${status}, ${JSON.stringify(data.extraPhotos ?? [])}, ${await requireBatchNumber(data.batchNumber ?? "")}
      )
      returning *
    `;
    return mapSet(rows[0]);
  });

export const importCsv = createServerFn({ method: "POST" })
  .validator(z.object({ csv: z.string().min(8).max(400_000) }))
  .handler(async ({ data }) => {
    const { rows, issues } = parseInventoryCsv(data.csv);
    const sql = await getSql();
    let added = 0;
    let updated = 0;

    for (const row of rows) {
      try {
        let setNum = row.setNum;
        let name = row.name;
        let category = row.category;
        let subCategory = row.subCategory;
        let year = row.year;
        let weight = row.weightGrams;
        let theme: string | null = row.category;
        let themeId: number | null = null;
        let numParts: number | null = null;
        let imageUrl: string | null = null;
        const itemType = row.itemType;

        if (!name || !category || year == null) {
          try {
            const hits = await searchCatalog(row.setNum, { itemType });
            const hit =
              hits.find((h) => h.setNum.toLowerCase() === row.setNum.toLowerCase()) ??
              hits.find((h) => h.setNum.toLowerCase() === `${row.setNum.toLowerCase()}-1`) ??
              hits[0];
            if (hit) {
              setNum = hit.setNum;
              name = name || hit.name;
              category = category ?? hit.category;
              subCategory = subCategory ?? hit.subCategory;
              year = year ?? hit.year;
              weight = weight ?? hit.weightGrams;
              theme = hit.theme ?? category;
              themeId = hit.themeId;
              numParts = hit.numParts;
              imageUrl = hit.imageUrl;
            }
          } catch {
            /* catalog fill is optional */
          }
        }
        if (!name) {
          issues.push({
            line: row.line,
            message: "Missing item name — add Name or a known set number",
          });
          continue;
        }

        if (row.sku.trim()) {
          const sku = normalizeSku(row.sku);
          const existing = await sql<Row>`select * from lego_sets where sku = ${sku}`;
          if (existing[0]) {
            const cur = existing[0];
            await sql`
              update lego_sets
              set item_type = ${itemType},
                  set_num = ${setNum},
                  name = ${name},
                  year = ${year ?? cur.year},
                  theme = ${theme ?? cur.theme},
                  category = ${category ?? cur.category},
                  sub_category = ${subCategory ?? cur.sub_category},
                  weight_grams = ${weight ?? cur.weight_grams},
                  condition = ${row.condition},
                  comes_with_instructions = ${row.comesWithInstructions},
                  comes_with_box = ${row.comesWithBox},
                  qty = ${row.qty},
                  asking_price = ${row.askingPrice ?? cur.asking_price},
                  currency = ${row.currency || cur.currency},
                  location = ${row.location || cur.location},
                  notes = ${row.notes || cur.notes},
                  status = ${row.status},
                  updated_at = now()
              where id = ${cur.id}
            `;
            updated += 1;
            continue;
          }
        }

        const sku = await assignSku(row.sku || undefined, setNum, itemType);
        const location = cleanLocation(row.location);
        await sql`
          insert into lego_sets (
            item_type, set_num, sku, location, name, year, theme, theme_id, category, sub_category, weight_grams,
            num_parts, image_url, condition, comes_with_instructions, comes_with_box, qty, asking_price, currency, notes, status
          ) values (
            ${itemType}, ${setNum}, ${sku}, ${location}, ${name}, ${year}, ${theme}, ${themeId}, ${category}, ${subCategory},
            ${weight}, ${numParts}, ${imageUrl}, ${row.condition}, ${row.comesWithInstructions}, ${row.comesWithBox}, ${row.qty}, ${row.askingPrice},
            ${row.currency}, ${row.notes}, ${row.status}
          )
        `;
        added += 1;
      } catch (err) {
        issues.push({
          line: row.line,
          message: err instanceof Error ? err.message : "Could not import this row",
        });
      }
    }

    return { added, updated, skipped: issues.length, issues: issues.slice(0, 40) };
  });

export const seedDemoCatalog = createServerFn({ method: "POST" })
  .validator(z.object({}).optional())
  .handler(async () => {
  const sql = await getSql();
  const existing = await sql<{ id: number; item_type: string; sku: string | null }>`
    select id, item_type, sku from lego_sets order by id
  `;
  const oldAuto = /^GBB-(SET|MINIFIG)-[A-Z0-9]+-\d+$/;
  const toRewrite = existing.filter((row) => oldAuto.test((row.sku ?? "").toUpperCase()));
  if (toRewrite.length) {
    for (const row of toRewrite) {
      await sql`update lego_sets set sku = ${`GBB-TMP-${row.id}`} where id = ${row.id}`;
    }
    const byType = { set: 0, minifig: 0 };
    for (const row of toRewrite) {
      const type = row.item_type === "minifig" ? "minifig" : "set";
      byType[type] += 1;
      const next = formatSku("", type, byType[type]);
      await sql`update lego_sets set sku = ${next} where id = ${row.id}`;
    }
  }

  const seq = new Map<string, number>();
  const used = await sql<{ sku: string | null }>`select sku from lego_sets`;
  for (const row of used) {
    const sku = (row.sku ?? "").toUpperCase();
    if (sku.startsWith("GBB-SET-") && /^\d+$/.test(sku.slice("GBB-SET-".length))) {
      seq.set("set", Math.max(seq.get("set") ?? 0, Number(sku.slice("GBB-SET-".length))));
    }
    if (sku.startsWith("GBB-MINIFIG-") && /^\d+$/.test(sku.slice("GBB-MINIFIG-".length))) {
      seq.set("minifig", Math.max(seq.get("minifig") ?? 0, Number(sku.slice("GBB-MINIFIG-".length))));
    }
  }

  let added = 0;
  const locations: string[] = [];
  for (const lot of DEMO_LOTS) {
    const key = lot.itemType;
    const n = (seq.get(key) ?? 0) + 1;
    seq.set(key, n);
    const sku = formatSku(lot.setNum, lot.itemType, n);
    const location = cleanLocation(lot.location);
    const imageUrl = demoImageUrl(lot);
    try {
      const rows = await sql<{ id: number }>`
        insert into lego_sets (
          item_type, set_num, sku, location, name, year, theme, theme_id, category, sub_category, weight_grams,
          num_parts, image_url, condition, comes_with_instructions, comes_with_box, qty, asking_price, currency, notes, status
        ) values (
          ${lot.itemType}, ${lot.setNum}, ${sku}, ${location}, ${lot.name}, ${lot.year}, ${lot.category}, ${null},
          ${lot.category}, ${lot.subCategory}, ${null}, ${null}, ${imageUrl}, ${lot.condition}, ${lot.instructions},
          ${lot.box}, ${lot.qty}, ${lot.price}, ${"GBP"}, ${lot.notes}, ${lot.status}
        )
        on conflict (sku) do nothing
        returning id
      `;
      if (rows[0]) {
        added += 1;
        if (location) locations.push(location);
      }
    } catch {
      /* skip a row that cannot insert */
    }
  }
  return { added, total: DEMO_LOTS.length, locations: [...new Set(locations)] };
});

export const updateSet = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.number().int(),
      sku: z.string().max(50).optional(),
      location: z.string().max(40).optional(),
      name: z.string().min(1).max(200).optional(),
      category: z.string().max(80).nullable().optional(),
      subCategory: z.string().max(80).nullable().optional(),
      year: z.number().int().nullable().optional(),
      weightGrams: z.number().finite().nullable().optional(),
      condition: z
        .enum(["used_complete", "used_incomplete", "used_parts", "new_sealed", "new_opened"])
        .optional(),
      comesWithInstructions: inclusionEnum.optional(),
      comesWithBox: inclusionEnum.optional(),
      qty: z.number().int().min(1).max(99).optional(),
      askingPrice: z.number().finite().nullable().optional(),
      notes: z.string().max(2000).optional(),
      status: z.enum(["complete", "incomplete", "for_sale", "listed", "reserved", "sold"]).optional(),
      extraPhotos: z.array(z.string().max(2_000_000)).max(6).optional(),
      batchNumber: z.string().max(20).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const sql = await getSql();
    await ensureExtraPhotosColumn();
    await ensureBatchColumn();
    const current = await sql<Row>`select * from lego_sets where id = ${data.id}`;
    if (!current[0]) throw new Error("Set not found.");
    const next = current[0];
    const itemType = asItemType(next.item_type);
    const sku =
      data.sku === undefined
        ? (next.sku ?? (await assignSku(undefined, next.set_num, itemType, data.id)))
        : await assignSku(data.sku, next.set_num, itemType, data.id);
    const name = data.name ?? next.name;
    const category = data.category === undefined ? next.category : data.category;
    const subCategory = data.subCategory === undefined ? next.sub_category : data.subCategory;
    const year = data.year === undefined ? next.year : data.year;
    const weight = data.weightGrams === undefined ? next.weight_grams : data.weightGrams;
    const condition = data.condition ?? next.condition;
    const comesWithInstructions = data.comesWithInstructions ?? asInclusion(next.comes_with_instructions);
    const comesWithBox = data.comesWithBox ?? asInclusion(next.comes_with_box);
    const qty = data.qty ?? next.qty;
    const asking = data.askingPrice === undefined ? next.asking_price : data.askingPrice;
    const location = data.location === undefined ? (next.location ?? "") : cleanLocation(data.location);
    const notes = data.notes ?? next.notes;
    const status = data.status ?? next.status;
    const extraPhotos =
      data.extraPhotos === undefined ? (next.extra_photos ?? "[]") : JSON.stringify(data.extraPhotos);
    const batchNumber =
      data.batchNumber === undefined ? (next.batch_number ?? "") : await requireBatchNumber(data.batchNumber);
    const rows = await sql<Row>`
      update lego_sets
      set sku = ${sku},
          location = ${location},
          name = ${name},
          category = ${category},
          sub_category = ${subCategory},
          year = ${year},
          weight_grams = ${weight},
          condition = ${condition},
          comes_with_instructions = ${comesWithInstructions},
          comes_with_box = ${comesWithBox},
          qty = ${qty},
          asking_price = ${asking},
          notes = ${notes},
          status = ${status},
          extra_photos = ${extraPhotos},
          batch_number = ${batchNumber},
          updated_at = now()
      where id = ${data.id}
      returning *
    `;
    return mapSet(rows[0]);
  });

export const refreshCatalog = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number().int(), settings: settingsSchema.optional() }))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const current = await sql<Row>`select * from lego_sets where id = ${data.id}`;
    if (!current[0]) throw new Error("Set not found.");
    const set = mapSet(current[0]);
    const creds = credsFromSettings(data.settings);
    const hit = await enrichCatalogHit({
      itemType: set.itemType,
      setNum: set.setNum,
      name: set.name,
      year: set.year,
      theme: set.theme,
      themeId: set.themeId,
      category: set.category,
      subCategory: set.subCategory,
      weightGrams: set.weightGrams,
      numParts: set.numParts,
      imageUrl: set.imageUrl,
      rebrickableUrl: set.itemType === "minifig"
        ? `https://rebrickable.com/minifigs/${set.setNum}/`
        : `https://rebrickable.com/sets/${set.setNum}/`,
      retailPrice: set.retailPrice,
    }, creds);
    const rows = await sql<Row>`
      update lego_sets
      set name = ${hit.name},
          year = ${hit.year},
          theme = ${hit.theme},
          category = ${hit.category},
          sub_category = ${hit.subCategory},
          weight_grams = ${hit.weightGrams},
          image_url = ${hit.imageUrl ?? current[0].image_url},
          updated_at = now()
      where id = ${data.id}
      returning *
    `;
    return mapSet(rows[0]);
  });

export const deleteSet = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number().int() }))
  .handler(async ({ data }) => {
    const sql = await getSql();
    await sql`delete from lego_sets where id = ${data.id}`;
    return { ok: true as const };
  });

export const refreshPrice = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.number().int(),
      ebayClientId: z.string().optional().default(""),
      ebayClientSecret: z.string().optional().default(""),
      blConsumerKey: z.string().optional().default(""),
      blConsumerSecret: z.string().optional().default(""),
      blToken: z.string().optional().default(""),
      blTokenSecret: z.string().optional().default(""),
      marketplace: z
        .enum(["EBAY_US", "EBAY_GB", "EBAY_AU", "EBAY_CA", "EBAY_DE"])
        .optional()
        .default("EBAY_GB"),
    }),
  )
  .handler(async ({ data }) => {
    const sql = await getSql();
    const current = await sql<Row>`select * from lego_sets where id = ${data.id}`;
    if (!current[0]) throw new Error("Set not found.");
    const set = mapSet(current[0]);
    const price = await fetchMarketPrice({
      setNum: set.setNum,
      name: set.name,
      marketplace: data.marketplace,
      ebayClientId: data.ebayClientId,
      ebayClientSecret: data.ebayClientSecret,
      blConsumerKey: data.blConsumerKey,
      blConsumerSecret: data.blConsumerSecret,
      blToken: data.blToken,
      blTokenSecret: data.blTokenSecret,
      itemType: set.itemType,
    });
    const isNew = set.condition === "new_sealed" || set.condition === "new_opened";
    const avg = isNew ? (price.new ?? price.used) : (price.used ?? price.new);
    const asking = avg ?? set.askingPrice;
    const rows = await sql<Row>`
      update lego_sets
      set used_price = ${price.used},
          used_price_min = ${price.usedMin},
          used_price_max = ${price.usedMax},
          used_price_source = ${price.source},
          used_price_at = now(),
          new_price = ${price.new},
          new_price_min = ${price.newMin},
          new_price_max = ${price.newMax},
          retail_price = ${price.retail ?? set.retailPrice},
          asking_price = ${asking},
          currency = ${price.currency},
          updated_at = now()
      where id = ${data.id}
      returning *
    `;
    return { set: mapSet(rows[0]), price };
  });

export const previewListing = createServerFn({ method: "GET" })
  .validator(
    z.object({
      id: z.number().int(),
      marketplace: z
        .enum(["EBAY_US", "EBAY_GB", "EBAY_AU", "EBAY_CA", "EBAY_DE"])
        .optional()
        .default("EBAY_GB"),
    }),
  )
  .handler(async ({ data }) => {
    const sql = await getSql();
    const current = await sql<Row>`select * from lego_sets where id = ${data.id}`;
    if (!current[0]) throw new Error("Set not found.");
    const set = mapSet(current[0]);
    return { set, draft: composeListing(set, data.marketplace as MarketplaceId) };
  });

export const exportListingCsv = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.number().int(), settings: settingsSchema }))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const current = await sql<Row>`select * from lego_sets where id = ${data.id}`;
    if (!current[0]) throw new Error("Set not found.");
    const set = mapSet(current[0]);
    const draft = composeListing(set, data.settings.marketplace);
    return { csv: fileExchangeRow(set, data.settings, draft), filename: `${draft.sku}.csv` };
  });

export const listOnEbay = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number().int(), settings: settingsSchema }))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const current = await sql<Row>`select * from lego_sets where id = ${data.id}`;
    if (!current[0]) throw new Error("Set not found.");
    const set = mapSet(current[0]);
    const draft = composeListing(set, data.settings.marketplace);
    const published = await publishToEbay(set, data.settings, draft);
    const rows = await sql<Row>`
      update lego_sets
      set status = 'listed',
          ebay_item_id = ${published.itemId},
          ebay_listing_url = ${published.url},
          ebay_title = ${draft.title},
          ebay_listed = true,
          ebay_listing_status = 'listed',
          ebay_synced_at = now(),
          updated_at = now()
      where id = ${data.id}
      returning *
    `;
    return { set: mapSet(rows[0]), url: published.url, itemId: published.itemId };
  });

export const listOnBricklink = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number().int(), settings: settingsSchema }))
  .handler(async ({ data }) => {
    const creds = bricklinkCredsFrom(data.settings);
    if (!creds) throw new Error("Add BrickLink API keys in Settings to list.");
    const sql = await getSql();
    const current = await sql<Row>`select * from lego_sets where id = ${data.id}`;
    if (!current[0]) throw new Error("Set not found.");
    const set = mapSet(current[0]);
    const existing = await findBricklinkBySku(creds, set.sku);
    const lot = existing ?? (await createBricklinkLot(creds, set));
    const rows = await sql<Row>`
      update lego_sets
      set bl_listed = true,
          bl_listing_status = 'listed',
          bl_inventory_id = ${lot.inventoryId},
          bl_listing_url = ${lot.url},
          bl_synced_at = now(),
          updated_at = now()
      where id = ${data.id}
      returning *
    `;
    return { set: mapSet(rows[0]), url: lot.url, inventoryId: lot.inventoryId };
  });

export const syncListings = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.number().int().optional(), settings: settingsSchema }))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const rows = data.id
      ? await sql<Row>`select * from lego_sets where id = ${data.id}`
      : await sql<Row>`select * from lego_sets order by id`;
    if (data.id && !rows[0]) throw new Error("Set not found.");

    const token = data.settings.ebayUserToken.trim();
    const market = marketplaceOf(data.settings.marketplace);
    const blCreds = bricklinkCredsFrom(data.settings);

    let ebayMap: Map<string, Awaited<ReturnType<typeof lookupEbayBySku>>> | null = null;
    let warning: string | null = null;
    if (token && !data.id) {
      try {
        ebayMap = await listActiveEbayBySku(token, market.siteId, data.settings.marketplace);
      } catch (err) {
        warning = err instanceof Error ? err.message : "eBay SKU lookup failed.";
      }
    }

    let blLots: Awaited<ReturnType<typeof listBricklinkInventories>> | null = null;
    if (blCreds) {
      try {
        blLots = await listBricklinkInventories(blCreds);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "BrickLink Remarks lookup failed.";
        if (!token) throw new Error(msg);
        warning = warning ? `${warning} · ${msg}` : msg;
      }
    }

    if (!token && !blCreds) {
      throw new Error("Connect eBay or BrickLink in Settings to match SKUs.");
    }

    const updated: LegoSet[] = [];
    for (const row of rows) {
      const set = mapSet(row);
      let ebayListed = set.ebayListed;
      let ebayStatus = set.ebayListingStatus;
      let ebayItemId = set.ebayItemId;
      let ebayUrl = set.ebayListingUrl;
      let ebayTitle = set.ebayTitle;
      let blListed = set.blListed;
      let blStatus = set.blListingStatus;
      let blInv = set.blInventoryId;
      let blUrl = set.blListingUrl;

      if (token) {
        const hit = ebayMap
          ? (ebayMap.get(set.sku.toUpperCase()) ?? {
              listed: false,
              status: "not_listed" as const,
              itemId: null,
              url: null,
              title: null,
            })
          : await lookupEbayBySku(token, set.sku, market.siteId, data.settings.marketplace);
        ebayListed = hit.listed;
        ebayStatus = hit.status;
        ebayItemId = hit.itemId;
        ebayUrl = hit.url;
        ebayTitle = hit.title;
      }

      if (blLots) {
        const lot = matchBricklinkLot(blLots, set.sku);
        blListed = Boolean(lot);
        blStatus = lot ? "listed" : "not_listed";
        blInv = lot?.inventoryId ?? null;
        blUrl = lot?.url ?? null;
      }

      const ebaySynced = token ? new Date().toISOString() : iso(row.ebay_synced_at);
      const blSynced = blCreds ? new Date().toISOString() : iso(row.bl_synced_at);
      const next = await sql<Row>`
        update lego_sets
        set ebay_listed = ${ebayListed},
            ebay_listing_status = ${ebayStatus},
            ebay_item_id = ${ebayItemId},
            ebay_listing_url = ${ebayUrl},
            ebay_title = ${ebayTitle},
            ebay_synced_at = ${ebaySynced},
            bl_listed = ${blListed},
            bl_listing_status = ${blStatus},
            bl_inventory_id = ${blInv},
            bl_listing_url = ${blUrl},
            bl_synced_at = ${blSynced},
            updated_at = now()
        where id = ${row.id}
        returning *
      `;
      updated.push(mapSet(next[0]));
    }

    return {
      sets: updated,
      ebayMatched: updated.filter((s) => s.ebayListed).length,
      bricklinkMatched: updated.filter((s) => s.blListed).length,
      warning,
    };
  });

export const testEbayToken = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string().min(8), marketplace: z.string().optional() }))
  .handler(async ({ data }) => {
    const siteId =
      marketplaceOf((data.marketplace as MarketplaceId) || "EBAY_GB").siteId;
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetUserRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
</GetUserRequest>`;
    const res = await fetch("https://api.ebay.com/ws/api.dll", {
      method: "POST",
      headers: {
        "Content-Type": "text/xml",
        "X-EBAY-API-COMPATIBILITY-LEVEL": "1395",
        "X-EBAY-API-CALL-NAME": "GetUser",
        "X-EBAY-API-SITEID": siteId,
        "X-EBAY-API-IAF-TOKEN": data.token.trim(),
      },
      body: xml,
    });
    const body = await res.text();
    const ack = body.match(/<Ack>([^<]+)<\/Ack>/)?.[1];
    const user = body.match(/<UserID>([^<]+)<\/UserID>/)?.[1];
    const long = body.match(/<LongMessage>([^<]+)<\/LongMessage>/)?.[1];
    if (ack !== "Success" && ack !== "Warning") {
      throw new Error(long || "eBay token was rejected.");
    }
    return { ok: true as const, userId: user ?? "ok" };
  });

export const testBricklinkToken = createServerFn({ method: "POST" })
  .validator(
    z.object({
      blConsumerKey: z.string(),
      blConsumerSecret: z.string(),
      blToken: z.string(),
      blTokenSecret: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const creds = bricklinkCredsFrom(data);
    if (!creds) throw new Error("Paste all four BrickLink API keys.");
    return testBricklinkCreds(creds);
  });
