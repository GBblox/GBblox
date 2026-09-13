import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { ownerMiddleware } from "@/lib/owner-middleware";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { bricklinkCredsFrom, markBricklinkOrderShipped } from "@/lib/bricklink-store";
import { markEbayOrderShipped } from "@/lib/ebay";
import { marketplaceOf } from "@/lib/format";
import { createRoyalMailLabel, fetchRoyalMailOrder, testRoyalMail } from "@/lib/royal-mail";
import type { PostageLabel, SaleOrderDetail } from "@/lib/types";
import { loadStoredSale } from "./orders";
import { applyMarketplaceEnv } from "./marketplace-env";

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
  royalMailApiKey: z.string().optional().default(""),
  royalMailSenderName: z.string().optional().default(""),
});

async function saleForPostage(channel: "ebay" | "bricklink", id: string): Promise<SaleOrderDetail> {
  const stored = await loadStoredSale(channel, id);
  if (stored) return stored;
  throw new Error("Open the order first so GBblox has the address, then send to Click & Drop.");
}

async function savePostage(channel: string, id: string, postage: PostageLabel): Promise<void> {
  const sql = await getSql();
  const shipped = postage.trackingNumber ? new Date().toISOString() : null;
  await sql`
    update sales
    set rm_order_id = ${postage.orderIdentifier},
        rm_tracking = ${postage.trackingNumber},
        rm_service = ${postage.serviceCode},
        rm_label_pdf = ${postage.labelPdf},
        rm_label_at = now(),
        shipped_at = coalesce(${shipped}, shipped_at)
    where channel = ${channel} and remote_id = ${id}
  `;
}

async function pushTrackingToMarketplace(
  detail: SaleOrderDetail,
  tracking: string,
  creds: {
    ebayUserToken: string;
    marketplace: "EBAY_US" | "EBAY_GB" | "EBAY_AU" | "EBAY_CA" | "EBAY_DE";
    blConsumerKey: string;
    blConsumerSecret: string;
    blToken: string;
    blTokenSecret: string;
  },
): Promise<string | null> {
  const track = tracking.trim();
  if (!track) return null;
  if (detail.channel === "ebay") {
    await markEbayOrderShipped(creds.ebayUserToken, marketplaceOf(creds.marketplace).siteId, detail.id, track);
    return `Tracking ${track} sent to eBay`;
  }
  const bl = bricklinkCredsFrom(creds);
  if (!bl) throw new Error("BrickLink API keys missing — tracking was not sent.");
  await markBricklinkOrderShipped(bl, detail.id, track);
  return `Tracking ${track} sent to BrickLink`;
}

async function withMarketplaceTracking(
  detail: SaleOrderDetail,
  postage: PostageLabel,
  creds: Parameters<typeof pushTrackingToMarketplace>[2],
): Promise<SaleOrderDetail> {
  const track = postage.trackingNumber?.trim() || "";
  if (!track) {
    return {
      ...detail,
      postage: {
        ...postage,
        marketplaceNote: "No tracking yet — refresh after you print in Click & Drop.",
      },
    };
  }
  try {
    const note = await pushTrackingToMarketplace(detail, track, creds);
    return {
      ...detail,
      shippedAt: detail.shippedAt || new Date().toISOString(),
      postage: { ...postage, marketplaceNote: note },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Could not send tracking to the marketplace.";
    return {
      ...detail,
      postage: { ...postage, marketplaceNote: msg },
    };
  }
}

export const testRoyalMailKey = createServerFn({ method: "POST" }).middleware([authMiddleware, ownerMiddleware])
  .validator(z.object({ royalMailApiKey: z.string().optional().default("") }))
  .handler(async ({ data }) => {
    const key = applyMarketplaceEnv(data).royalMailApiKey;
    if (!key) throw new Error("Set ROYAL_MAIL_API_KEY as a Vercel environment variable.");
    return testRoyalMail(key);
  });

export const createPostage = createServerFn({ method: "POST" }).middleware([authMiddleware, ownerMiddleware])
  .validator(
    credsSchema.extend({
      channel: z.enum(["ebay", "bricklink"]),
      id: z.string().min(1),
      serviceCode: z.string().min(1),
      packageFormat: z.string().min(1),
      weightGrams: z.number().int().min(1).max(30000),
    }),
  )
  .handler(async ({ data }): Promise<SaleOrderDetail> => {
    const creds = applyMarketplaceEnv(data);
    const key = creds.royalMailApiKey;
    if (!key) throw new Error("Set ROYAL_MAIL_API_KEY as a Vercel environment variable.");
    const detail = await saleForPostage(data.channel, data.id);
    const result = await createRoyalMailLabel(key, detail, {
      serviceCode: data.serviceCode,
      packageFormat: data.packageFormat,
      weightGrams: data.weightGrams,
      senderName: creds.royalMailSenderName,
    });
    const postage: PostageLabel = {
      orderIdentifier: result.orderIdentifier,
      trackingNumber: result.trackingNumber,
      serviceCode: result.serviceCode,
      labelPdf: result.labelPdf,
      createdAt: new Date().toISOString(),
    };
    await savePostage(detail.channel, detail.id, postage);
    return withMarketplaceTracking(detail, postage, creds);
  });

export const reprintPostage = createServerFn({ method: "POST" }).middleware([authMiddleware, ownerMiddleware])
  .validator(
    credsSchema.extend({
      channel: z.enum(["ebay", "bricklink"]),
      id: z.string().min(1),
    }),
  )
  .handler(async ({ data }): Promise<SaleOrderDetail> => {
    const creds = applyMarketplaceEnv(data);
    const key = creds.royalMailApiKey;
    if (!key) throw new Error("Set ROYAL_MAIL_API_KEY as a Vercel environment variable.");
    const detail = await saleForPostage(data.channel, data.id);
    const rmId = detail.postage?.orderIdentifier;
    if (!rmId) throw new Error("Send the order to Click & Drop first.");
    const printed = await fetchRoyalMailOrder(key, rmId);
    const postage: PostageLabel = {
      orderIdentifier: rmId,
      trackingNumber: printed.trackingNumber || detail.postage?.trackingNumber || null,
      serviceCode: detail.postage?.serviceCode || "",
      labelPdf: null,
      createdAt: detail.postage?.createdAt || new Date().toISOString(),
    };
    await savePostage(detail.channel, detail.id, postage);
    return withMarketplaceTracking(detail, postage, creds);
  });
