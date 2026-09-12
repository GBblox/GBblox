import { bricklinkCredsFrom, deleteBricklinkInventory, findBricklinkBySku } from "./bricklink-store";
import { getSql } from "./db";
import { endEbayListing, lookupEbayBySku } from "./ebay";
import { marketplaceOf } from "./format";
import { isPaidSale, saleLineSkus } from "./sold-rules";
import type { MarketplaceId, SaleChannel, SaleLine, SaleOrder } from "./types";

export { isPaidSale, saleLineSkus } from "./sold-rules";

type LotRow = {
  id: number;
  sku: string | null;
  status: string;
  ebay_listed: boolean | null;
  ebay_item_id: string | null;
  ebay_listing_status: string | null;
  bl_listed: boolean | null;
  bl_inventory_id: string | null;
  bl_listing_status: string | null;
};

export type SoldSyncCreds = {
  ebayUserToken?: string;
  marketplace?: MarketplaceId | string;
  blConsumerKey?: string;
  blConsumerSecret?: string;
  blToken?: string;
  blTokenSecret?: string;
};

export type SoldSyncResult = { marked: number; ended: string[]; warnings: string[] };

async function alreadyEnded(msg: string): Promise<boolean> {
  return /already (been )?(closed|ended|completed)|does not exist|not found|no longer available|resource not found/i.test(
    msg,
  );
}

export async function applySoldSale(
  order: { channel: SaleChannel; status: string; items: SaleLine[] },
  creds: SoldSyncCreds,
): Promise<SoldSyncResult> {
  const result: SoldSyncResult = { marked: 0, ended: [], warnings: [] };
  if (!isPaidSale(order.channel, order.status)) return result;
  const skus = saleLineSkus(order.items);
  if (!skus.length) return result;

  const sql = await getSql();
  const token = creds.ebayUserToken?.trim() || "";
  const market = marketplaceOf((creds.marketplace as MarketplaceId) || "EBAY_GB");
  const bl = bricklinkCredsFrom({
    blConsumerKey: creds.blConsumerKey || "",
    blConsumerSecret: creds.blConsumerSecret || "",
    blToken: creds.blToken || "",
    blTokenSecret: creds.blTokenSecret || "",
  });

  for (const sku of skus) {
    const lots = await sql<LotRow>`
      select id, sku, status, ebay_listed, ebay_item_id, ebay_listing_status,
             bl_listed, bl_inventory_id, bl_listing_status
      from lego_sets
      where upper(trim(sku)) = ${sku}
    `;
    for (const lot of lots) {
      let ebayListed = Boolean(lot.ebay_listed);
      let ebayStatus = lot.ebay_listing_status || "not_listed";
      let ebayItemId = lot.ebay_item_id;
      let blListed = Boolean(lot.bl_listed);
      let blStatus = lot.bl_listing_status || "not_listed";
      let blInv = lot.bl_inventory_id;

      if (order.channel === "ebay") {
        ebayListed = false;
        ebayStatus = "ended";
      } else {
        blListed = false;
        blStatus = "ended";
      }

      if (order.channel === "ebay" && (lot.bl_listed || lot.bl_inventory_id) && bl) {
        try {
          let inv = lot.bl_inventory_id;
          if (!inv) inv = (await findBricklinkBySku(bl, sku))?.inventoryId ?? null;
          if (inv) await deleteBricklinkInventory(bl, inv);
          blListed = false;
          blStatus = "ended";
          blInv = inv;
          result.ended.push(`bricklink:${sku}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Could not end BrickLink listing";
          if (await alreadyEnded(msg)) {
            blListed = false;
            blStatus = "ended";
          } else {
            result.warnings.push(`${sku}: BrickLink ${msg}`);
          }
        }
      }

      if (order.channel === "bricklink" && token && (lot.ebay_listed || lot.ebay_item_id)) {
        try {
          let itemId = lot.ebay_item_id;
          if (!itemId) {
            const hit = await lookupEbayBySku(token, sku, market.siteId, market.id);
            itemId = hit.itemId;
          }
          await endEbayListing(token, market.siteId, { sku, itemId });
          ebayListed = false;
          ebayStatus = "ended";
          ebayItemId = itemId;
          result.ended.push(`ebay:${sku}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Could not end eBay listing";
          if (await alreadyEnded(msg)) {
            ebayListed = false;
            ebayStatus = "ended";
          } else {
            result.warnings.push(`${sku}: eBay ${msg}`);
          }
        }
      }

      const now = new Date().toISOString();
      await sql`
        update lego_sets
        set status = 'sold',
            ebay_listed = ${ebayListed},
            ebay_listing_status = ${ebayStatus},
            ebay_item_id = ${ebayItemId},
            ebay_synced_at = ${now},
            bl_listed = ${blListed},
            bl_listing_status = ${blStatus},
            bl_inventory_id = ${blInv},
            bl_synced_at = ${now},
            updated_at = now()
        where id = ${lot.id}
      `;
      if (lot.status !== "sold") result.marked += 1;
    }
  }
  return result;
}

export async function applySoldOrders(orders: SaleOrder[], creds: SoldSyncCreds): Promise<string[]> {
  const warnings: string[] = [];
  for (const order of orders) {
    if (!isPaidSale(order.channel, order.status) || !saleLineSkus(order.items).length) continue;
    try {
      const r = await applySoldSale(order, creds);
      warnings.push(...r.warnings);
    } catch (err) {
      warnings.push(
        `#${order.id}: ${err instanceof Error ? err.message : "Could not mark sold / end the other listing"}`,
      );
    }
  }
  return warnings;
}
