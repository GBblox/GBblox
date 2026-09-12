import type { SaleAddress, SaleOrderDetail } from "./types";

/** Pay-as-you-go / OLP (non-OBA) Click & Drop service codes. */
export const RM_SERVICES = [
  { code: "TOLP24", label: "Tracked 24" },
  { code: "TOLP48", label: "Tracked 48" },
  { code: "OLP1", label: "1st Class" },
  { code: "OLP2", label: "2nd Class" },
  { code: "OLP1SF", label: "Signed For 1st Class" },
  { code: "OLP2SF", label: "Signed For 2nd Class" },
  { code: "SD1OLP", label: "Special Delivery 1pm" },
] as const;

export const RM_PACKAGES = [
  { code: "largeLetter", label: "Large letter" },
  { code: "smallParcel", label: "Small parcel" },
  { code: "mediumParcel", label: "Medium parcel" },
  { code: "largeParcel", label: "Large parcel" },
] as const;

export const CLICK_AND_DROP_APP = "https://business.parcel.royalmail.com/";

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
  if (!c) return "GBR";
  if (c === "UK" || c === "GB" || c === "GBR") return "GBR";
  if (/united kingdom|great britain|england|scotland|wales|northern ireland/.test(c.toLowerCase())) return "GBR";
  if (c.length === 2) return c;
  return "GBR";
}

export function serviceLabel(code: string): string {
  return RM_SERVICES.find((s) => s.code === code)?.label ?? code;
}

function money(n: number | null | undefined): number {
  return n != null && Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function clip(s: string, max: number): string {
  return s.trim().slice(0, max);
}

export function requiredCity(addr: SaleAddress): string {
  return clip(addr.city, 100) || clip(addr.region, 100) || clip(addr.line2, 100) || "Unknown";
}

function rmAddress(addr: SaleAddress, name: string) {
  return {
    fullName: clip(name || "Customer", 210),
    addressLine1: clip(addr.line1, 100),
    addressLine2: clip(addr.line2, 100) || undefined,
    city: requiredCity(addr),
    county: clip(addr.region, 100) || undefined,
    postcode: clip(addr.postal, 20),
    countryCode: countryCode(addr.country),
  };
}

export function buildClickAndDropOrder(
  detail: SaleOrderDetail,
  opts: {
    serviceCode: string;
    packageFormat: string;
    weightGrams: number;
    senderName?: string;
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
  const service = opts.serviceCode.trim().toUpperCase();
  const ship = rmAddress(addr, addr.name || detail.buyer);
  return {
    items: [
      {
        orderReference: `BS-${detail.channel}-${detail.id}`.slice(0, 40),
        isRecipientABusiness: false,
        recipient: {
          address: ship,
          phoneNumber: detail.phone || undefined,
          emailAddress: detail.email || undefined,
        },
        billing: {
          address: ship,
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
          ...(service ? { serviceCode: service } : {}),
          sendNotificationsTo: "recipient" as const,
          receiveEmailNotification: Boolean(detail.email),
        },
      },
    ],
  };
}

async function rmFetch(path: string, apiKey: string, init: RequestInit = {}): Promise<Response> {
  const key = apiKey.trim();
  const authorization = /^bearer\s/i.test(key) ? key : key;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: authorization,
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
  const failed = o.failedOrders as Array<{ errors?: Array<{ message?: string; errorMessage?: string; errorCode?: string }> }> | undefined;
  const first = failed?.[0]?.errors?.[0]?.message || failed?.[0]?.errors?.[0]?.errorMessage;
  if (first) return first;
  const errors = o.errors as Array<{ message?: string }> | undefined;
  if (errors?.[0]?.message) return errors[0].message;
  return fallback;
}

type CreatedRow = {
  orderIdentifier?: number | string;
  orderReference?: string;
  trackingNumber?: string | null;
  packages?: Array<{ trackingNumber?: string }>;
};

function trackingOf(row: CreatedRow | null | undefined): string | null {
  const t = row?.trackingNumber || row?.packages?.[0]?.trackingNumber || null;
  return t ? String(t) : null;
}

/** Only a CreateOrders `createdOrders` row counts as a new Click & Drop order. */
export function parseCreateOrdersResponse(json: unknown): { id: string; tracking: string | null; reference: string | null } {
  if (!json || typeof json !== "object") {
    throw new Error("Click & Drop returned an empty response.");
  }
  const o = json as Record<string, unknown>;
  const failMsg = errorText(json, "");
  if (typeof o.successCount === "number" && o.successCount < 1) {
    throw new Error(failMsg || "Click & Drop did not create the order.");
  }
  const created = Array.isArray(o.createdOrders) ? (o.createdOrders as CreatedRow[]) : [];
  const row = created[0];
  const id = row?.orderIdentifier;
  if (id == null || id === "") {
    throw new Error(failMsg || "Click & Drop did not create the order. Check the address and try again.");
  }
  return {
    id: String(id),
    tracking: trackingOf(row),
    reference: row.orderReference ? String(row.orderReference) : null,
  };
}

function looksLikeServiceError(msg: string): boolean {
  return /service code|not supported|could not be found|postageDetails/i.test(msg);
}

export async function testRoyalMail(apiKey: string): Promise<{ ok: true; release: string }> {
  const res = await rmFetch("/version", apiKey);
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(errorText(json, `Royal Mail rejected the key (${res.status}).`));
  const release = String((json as { release?: string } | null)?.release || "ok");
  return { ok: true, release };
}

async function postOrders(apiKey: string, payload: unknown): Promise<{ json: unknown; res: Response }> {
  // Official Click & Drop docs use POST /Orders (capital O).
  const res = await rmFetch("/Orders", apiKey, { method: "POST", body: JSON.stringify(payload) });
  const json = await res.json().catch(() => null);
  if (res.status === 404) {
    const retry = await rmFetch("/orders", apiKey, { method: "POST", body: JSON.stringify(payload) });
    const retryJson = await retry.json().catch(() => null);
    return { json: retryJson, res: retry };
  }
  return { json, res };
}

/** Create a Click & Drop order. OLP (non-OBA) accounts cannot retrieve labels. */
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
  let payload = buildClickAndDropOrder(detail, opts);
  let { json, res } = await postOrders(key, payload);
  let msg = errorText(json, "");
  if (!res.ok && looksLikeServiceError(msg)) {
    payload = buildClickAndDropOrder(detail, { ...opts, serviceCode: "" });
    ({ json, res } = await postOrders(key, payload));
    msg = errorText(json, "");
  }
  if (!res.ok) throw new Error(msg || `Royal Mail create order failed (${res.status}).`);
  let created;
  try {
    created = parseCreateOrdersResponse(json);
  } catch (err) {
    if (looksLikeServiceError(msg || (err instanceof Error ? err.message : ""))) {
      payload = buildClickAndDropOrder(detail, { ...opts, serviceCode: "" });
      ({ json, res } = await postOrders(key, payload));
      if (!res.ok) throw new Error(errorText(json, `Royal Mail create order failed (${res.status}).`));
      created = parseCreateOrdersResponse(json);
    } else {
      throw err;
    }
  }
  let tracking = created.tracking;
  if (!tracking) {
    const pulled = await fetchRoyalMailOrder(key, created.id).catch(() => null);
    tracking = pulled?.trackingNumber ?? null;
  }
  return {
    orderIdentifier: created.id,
    trackingNumber: tracking,
    serviceCode: opts.serviceCode,
    labelPdf: null,
  };
}

export async function fetchRoyalMailOrder(apiKey: string, orderIdentifier: string): Promise<PostageResult> {
  const id = encodeURIComponent(orderIdentifier);
  let res = await rmFetch(`/Orders/${id}`, apiKey);
  if (res.status === 404) res = await rmFetch(`/orders/${id}`, apiKey);
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(errorText(json, `Royal Mail could not load that order (${res.status}).`));
  const list: CreatedRow[] = Array.isArray(json)
    ? (json as CreatedRow[])
    : Array.isArray((json as { orders?: CreatedRow[] } | null)?.orders)
      ? ((json as { orders: CreatedRow[] }).orders)
      : Array.isArray((json as { createdOrders?: CreatedRow[] } | null)?.createdOrders)
        ? ((json as { createdOrders: CreatedRow[] }).createdOrders)
        : [];
  const row = list.find((r) => String(r.orderIdentifier) === String(orderIdentifier)) ?? list[0];
  return {
    orderIdentifier,
    trackingNumber: trackingOf(row),
    serviceCode: "",
    labelPdf: null,
  };
}

/** OBA-only. OLP accounts cannot retrieve labels — kept for older saved PDFs. */
export async function fetchRoyalMailLabel(apiKey: string, orderIdentifier: string): Promise<PostageResult> {
  return fetchRoyalMailOrder(apiKey, orderIdentifier);
}
