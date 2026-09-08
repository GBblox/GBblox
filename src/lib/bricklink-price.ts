import type { ItemType } from "./types";

export function bricklinkItemType(itemType: ItemType): "MINIFIG" | "SET" {
  return itemType === "minifig" ? "MINIFIG" : "SET";
}

export function bricklinkItemCandidates(itemType: ItemType, itemNo: string): string[] {
  const no = itemNo.trim();
  if (!no) return [];
  if (itemType === "set" && !no.includes("-")) return [`${no}-1`, no];
  return [no];
}

export type BricklinkPriceBand = {
  min: number | null;
  avg: number | null;
  max: number | null;
  qtyAvg: number | null;
  unitQuantity: number;
  totalQuantity: number;
  currency: string;
  condition: "N" | "U";
  guideType: "sold" | "stock";
  itemNo: string;
};

function moneyOf(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function parseBricklinkPriceGuide(
  data: {
    item?: { no?: string };
    new_or_used?: string;
    currency_code?: string;
    min_price?: string | number;
    max_price?: string | number;
    avg_price?: string | number;
    qty_avg_price?: string | number;
    unit_quantity?: number;
    total_quantity?: number;
  } | null | undefined,
  guideType: "sold" | "stock",
): BricklinkPriceBand | null {
  if (!data) return null;
  const min = moneyOf(data.min_price);
  const avg = moneyOf(data.qty_avg_price) ?? moneyOf(data.avg_price);
  const max = moneyOf(data.max_price);
  if (min == null && avg == null && max == null) return null;
  return {
    min,
    avg,
    max,
    qtyAvg: moneyOf(data.qty_avg_price),
    unitQuantity: Number(data.unit_quantity) || 0,
    totalQuantity: Number(data.total_quantity) || 0,
    currency: String(data.currency_code || "").toUpperCase() || "GBP",
    condition: data.new_or_used === "U" ? "U" : "N",
    guideType,
    itemNo: data.item?.no ?? "",
  };
}
