import {
  CONDITIONS,
  INCLUSIONS,
  MARKETPLACES,
  type ChannelStatus,
  type ItemType,
  type MarketplaceId,
} from "./types";

export function conditionLabel(value: string): string {
  return CONDITIONS.find((c) => c.value === value)?.label ?? value;
}

export function conditionCode(value: string): "N" | "U" {
  return value.startsWith("new") ? "N" : "U";
}

export function inclusionLabel(value: string): string {
  return INCLUSIONS.find((i) => i.value === value)?.label ?? "Not Applicable";
}

export function statusLabel(value: string): string {
  return value === "sold" ? "Sold" : "Available";
}

export function statusBadgeVariant(value: string): "sold" | "sale" {
  return value === "sold" ? "sold" : "sale";
}

export function marketplaceOf(id: MarketplaceId) {
  return MARKETPLACES.find((m) => m.id === id) ?? MARKETPLACES[0];
}

export {
  addLocationOption,
  isValidLocation,
  locationChoices,
  mergeLocationOptions,
  normalizeLocation,
  parseLocations,
  removeLocationOption,
} from "./locations";

export function formatMoney(amount: number | null | undefined, currency = "GBP"): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: amount >= 100 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function setNumberDisplay(setNum: string): string {
  return setNum.replace(/-1$/, "");
}

export function itemNumberDisplay(itemNo: string, itemType: ItemType = "set"): string {
  if (itemType === "minifig") return itemNo;
  return setNumberDisplay(itemNo);
}

export function itemTypeLabel(itemType: ItemType | null | undefined): string {
  return itemType === "minifig" ? "Minifigure" : "Set";
}

export function detectItemType(query: string): ItemType | "all" {
  const q = query.trim();
  if (!q) return "all";
  if (/^fig-/i.test(q)) return "minifig";
  if (/^[a-z]{1,8}\d+[a-z0-9]*$/i.test(q)) return "minifig";
  if (/^\d/.test(q)) return "set";
  return "all";
}

export function ebaySearchQuery(setNum: string, name: string, itemType: ItemType = "set"): string {
  const kind = itemType === "minifig" ? "minifigure" : "";
  return `LEGO ${kind} ${itemNumberDisplay(setNum, itemType)} ${name}`.replace(/\s+/g, " ").trim();
}

export function clampTitle(title: string, max = 80): string {
  const t = title.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

export function bricklinkUrl(setNum: string, itemType: ItemType = "set"): string {
  const key = itemType === "minifig" ? "M" : "S";
  return `https://www.bricklink.com/v2/catalog/catalogitem.page?${key}=${encodeURIComponent(setNum)}`;
}

export function formatWeight(grams: number | null | undefined): string {
  if (grams == null || Number.isNaN(grams)) return "—";
  return `${grams.toLocaleString()} g`;
}

export function rebrickableBuyUrl(setNum: string, itemType: ItemType = "set"): string {
  if (itemType === "minifig") return `https://rebrickable.com/minifigs/${encodeURIComponent(setNum)}/`;
  return `https://rebrickable.com/sets/${setNum}/#buy`;
}

export function channelLabel(status: ChannelStatus | null | undefined): string {
  if (status === "listed") return "Listed";
  if (status === "ended") return "Ended";
  if (status === "not_listed") return "Not listed";
  return "Not checked";
}

export function channelBadgeVariant(
  status: ChannelStatus | null | undefined,
): "channel-listed" | "channel-not-listed" | "channel-unchecked" {
  if (status === "listed") return "channel-listed";
  if (status === "not_listed" || status === "ended") return "channel-not-listed";
  return "channel-unchecked";
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function saleStatusLabel(status: string): string {
  const s = status.trim();
  if (!s) return "Unknown";
  const key = s.toLowerCase();
  const map: Record<string, string> = {
    completed: "Completed",
    active: "Open",
    cancelled: "Cancelled",
    canceled: "Cancelled",
    shipped: "Shipped",
    paid: "Paid",
    packed: "Packed",
    pending: "Pending",
    processing: "Processing",
    ready: "Ready",
    received: "Received",
    updated: "Updated",
    inactive: "Inactive",
    ocr: "OCR",
    npb: "NPB",
    npx: "NPX",
    nrs: "NRS",
    nss: "NSS",
  };
  return map[key] ?? s.replaceAll("_", " ");
}

export function decodeEntities(raw: unknown): string {
  const s = raw == null ? "" : String(raw);
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&nbsp;", " ");
}

export function formatAddress(addr: {
  name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postal: string;
  country: string;
} | null | undefined): string {
  if (!addr) return "";
  return [addr.name, addr.line1, addr.line2, [addr.city, addr.region, addr.postal].filter(Boolean).join(" "), addr.country]
    .map((p) => p.trim())
    .filter(Boolean)
    .join("\n");
}
