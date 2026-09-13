import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { ownerMiddleware } from "@/lib/owner-middleware";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { createRoyalMailLabel, fetchRoyalMailOrder, testRoyalMail } from "@/lib/royal-mail";
import type { PostageLabel, SaleOrderDetail } from "@/lib/types";
import { getSaleOrder } from "./orders";
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

async function savePostage(channel: string, id: string, postage: PostageLabel): Promise<void> {
  const sql = await getSql();
  await sql`
    update sales
    set rm_order_id = ${postage.orderIdentifier},
        rm_tracking = ${postage.trackingNumber},
        rm_service = ${postage.serviceCode},
        rm_label_pdf = ${postage.labelPdf},
        rm_label_at = now()
    where channel = ${channel} and remote_id = ${id}
  `;
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
    const detail = await getSaleOrder({
      data: {
        ebayUserToken: creds.ebayUserToken,
        blConsumerKey: creds.blConsumerKey,
        blConsumerSecret: creds.blConsumerSecret,
        blToken: creds.blToken,
        blTokenSecret: creds.blTokenSecret,
        marketplace: data.marketplace,
        channel: data.channel,
        id: data.id,
        refresh: false,
      },
    });
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
    return { ...detail, postage };
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
    const detail = await getSaleOrder({
      data: {
        ebayUserToken: creds.ebayUserToken,
        blConsumerKey: creds.blConsumerKey,
        blConsumerSecret: creds.blConsumerSecret,
        blToken: creds.blToken,
        blTokenSecret: creds.blTokenSecret,
        marketplace: data.marketplace,
        channel: data.channel,
        id: data.id,
        refresh: false,
      },
    });
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
    return { ...detail, postage };
  });
