import type { SaleOrderDetail } from "./types";

export const RM_SERVICES = [
  { code: "TPN24", label: "Tracked 24" },
  { code: "TPS48", label: "Tracked 48" },
  { code: "STL1", label: "1st Class" },
  { code: "STL2", label: "2nd Class" },
  { code: "SD1", label: "Special Delivery 1pm" },
] as const;

export const RM_PACKAGES = [
  { code: "largeLetter", label: "Large letter" },
  { code: "smallParcel", label: "Small parcel" },
  { code: "mediumParcel", label: "Medium parcel" },
  { code: "largeParcel", label: "Large parcel" },
] as const;

export type RmPackageCode = (typeof RM_PACKAGES)[number]["code"];
export type RmServiceCode = (typeof RM_SERVICES)[number]["code"];

export type PostageResult = {
  orderIdentifier: string;
  trackingNumber: string | null;
  serviceCode: string;
  labelPdf: string | null;
};

const BASE = "https://api.parcel.royalmail.com/api/v1";

export function countryCode(country: string | null | undefined): string {
  const c = (country ?? "").trim().toUpperCase();
  if (!c) return "GB";
  if (c.length === 2) return c === "UK" ? "GB" : c;
  if (/united kingdom|great britain|england|scotland|wales|northern ireland/.test(c.toLowerCase())) return "GB";
  return "GB";
}

export function serviceLabel(code: string): string {
  return RM_SERVICES.find((s) => s.code === code)?.label ?? code;
}

function money(n: number | null | undefined): number {
  return n != null && Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function buildClickAndDropOrder(
  detail: SaleOrderDetail,
  opts: {
    serviceCode: string;
    packageFormat: string;
    weightGrams: number;
    senderName?: string;
    includeLabel: boolean;
  },
) {
  const addr = detail.address;
  if (!addr?.line1 || !addr.postal) {
    throw new Error("Pull the order first — Royal Mail needs a ship-to address.");
  }
  const weight = Math.max(1, Math.round(opts.weightGrams || 500));
  const lines = detail.items.length
    ? detail.items
    : [{ title: `Order ${detail.id}`, sku: null, itemNo: null, qty: 1, price: detail.total }];
  const qty = Math.max(1, lines.reduce((n, l) => n + (l.qty || 1), 0));
  const unitWeight = Math.max(1, Math.round(weight / qty));
  return {
    items: [
      {
        orderReference: `BS-${detail.channel}-${detail.id}`.slice(0, 40),
        isRecipientABusiness: false,
        recipient: {
          address: {
            fullName: addr.name || detail.buyer,
            addressLine1: addr.line1,
            addressLine2: addr.line2 || undefined,
            city: addr.city || addr.region || "Unknown",
            county: addr.region || undefined,
            postcode: addr.postal,
            countryCode: countryCode(addr.country),
          },
          phoneNumber: detail.phone || undefined,
          emailAddress: detail.email || undefined,
        },
        sender: opts.senderName?.trim()
          ? { tradingName: opts.senderName.trim() }
          : undefined,
        packages: [
          {
            weightInGrams: weight,
            packageFormatIdentifier: opts.packageFormat,
            contents: lines.map((line) => ({
              name: (line.title || "LEGO").slice(0, 100),
              SKU: line.sku || line.itemNo || undefined,
              quantity: Math.max(1, line.qty || 1),
              unitValue: money(line.price),
              unitWeightInGrams: unitWeight,
              originCountryCode: "GBR",
            })),
          },
        ],
        orderDate: detail.createdAt || new Date().toISOString(),
        subtotal: money(detail.subtotal ?? detail.total),
        shippingCostCharged: money(detail.shippingCost),
        total: money(detail.total),
        currencyCode: (detail.currency || "GBP").slice(0, 3).toUpperCase(),
        postageDetails: {
          serviceCode: opts.serviceCode,
          sendNotificationsTo: "recipient",
          receiveEmailNotification: Boolean(detail.email),
        },
        label: {
          includeLabelInResponse: opts.includeLabel,
          includeCN: false,
          includeReturnsLabel: false,
        },
      },
    ],
  };
}

async function rmFetch(path: string, apiKey: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: apiKey,
      Accept: "application/json, application/pdf",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  return res;
}

function errorText(json: unknown, fallback: string): string {
  if (!json || typeof json !== "object") return fallback;
  const o = json as Record<string, unknown>;
  if (typeof o.message === "string" && o.message) return o.message;
  if (typeof o.detail === "string" && o.detail) return o.detail;
  const failed = o.failedOrders as Array<{ errors?: Array<{ message?: string; errorMessage?: string }> }> | undefined;
  const first = failed?.[0]?.errors?.[0]?.message || failed?.[0]?.errors?.[0]?.errorMessage;
  if (first) return first;
  const errors = o.errors as Array<{ message?: string }> | undefined;
  if (errors?.[0]?.message) return errors[0].message;
  return fallback;
}

function asBase64Pdf(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const s = raw.trim();
  const i = s.indexOf("base64,");
  return i >= 0 ? s.slice(i + 7) : s.replace(/\s+/g, "");
}

export async function testRoyalMail(apiKey: string): Promise<{ ok: true; release: string }> {
  const res = await rmFetch("/version", apiKey);
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(errorText(json, `Royal Mail rejected the key (${res.status}).`));
  const release = String((json as { release?: string } | null)?.release || "ok");
  return { ok: true, release };
}

export async function createRoyalMailLabel(
  apiKey: string,
  detail: SaleOrderDetail,
  opts: {
    serviceCode: string;
    packageFormat: string;
    weightGrams: number;
    senderName?: string;
  },
): Promise<PostageResult> {
  const key = apiKey.trim();
  if (!key) throw new Error("Add a Royal Mail Click & Drop key in Settings.");
  const payload = buildClickAndDropOrder(detail, { ...opts, includeLabel: true });
  const res = await rmFetch("/Orders", key, { method: "POST", body: JSON.stringify(payload) });
  const json = (await res.json().catch(() => null)) as {
    createdOrders?: Array<{
      orderIdentifier?: number | string;
      orderReference?: string;
      trackingNumber?: string;
      label?: string;
      packages?: Array<{ trackingNumber?: string }>;
      labelErrors?: Array<{ message?: string; errorMessage?: string }>;
    }>;
    failedOrders?: Array<{ errors?: Array<{ message?: string; errorMessage?: string }> }>;
  } | null;
  if (!res.ok) throw new Error(errorText(json, `Royal Mail create order failed (${res.status}).`));
  const created = json?.createdOrders?.[0];
  if (!created?.orderIdentifier) {
    throw new Error(errorText(json, "Royal Mail did not create the order. Check the service and address."));
  }
  const id = String(created.orderIdentifier);
  let labelPdf = asBase64Pdf(created.label);
  let tracking = created.trackingNumber || created.packages?.[0]?.trackingNumber || null;
  if (!labelPdf) {
    const printed = await fetchRoyalMailLabel(key, id);
    labelPdf = printed.labelPdf;
    tracking = tracking || printed.trackingNumber;
  }
  if (created.labelErrors?.[0]) {
    const msg = created.labelErrors[0].message || created.labelErrors[0].errorMessage;
    if (!labelPdf && msg) throw new Error(msg);
  }
  return {
    orderIdentifier: id,
    trackingNumber: tracking,
    serviceCode: opts.serviceCode,
    labelPdf,
  };
}

export async function fetchRoyalMailLabel(apiKey: string, orderIdentifier: string): Promise<PostageResult> {
  const path =
    `/Orders/${encodeURIComponent(orderIdentifier)}/label` +
    `?documentType=postageLabel&includeReturnsLabel=false`;
  const res = await rmFetch(path, apiKey);
  const type = res.headers.get("content-type") || "";
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new Error(errorText(json, `Royal Mail could not print that label (${res.status}).`));
  }
  if (type.includes("pdf")) {
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      orderIdentifier,
      trackingNumber: null,
      serviceCode: "",
      labelPdf: buf.toString("base64"),
    };
  }
  const json = (await res.json().catch(() => null)) as { label?: string; trackingNumber?: string } | null;
  return {
    orderIdentifier,
    trackingNumber: json?.trackingNumber ?? null,
    serviceCode: "",
    labelPdf: asBase64Pdf(json?.label),
  };
}
