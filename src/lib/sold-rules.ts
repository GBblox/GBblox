import { normalizeSku } from "./sku.ts";
import type { SaleChannel, SaleLine } from "./types";

export function saleLineSkus(items: SaleLine[]): string[] {
  const out = new Set<string>();
  for (const line of items) {
    const sku = normalizeSku(line.sku || "");
    if (sku) out.add(sku);
  }
  return [...out];
}

export function isPaidSale(channel: SaleChannel, status: string): boolean {
  const s = (status || "").toLowerCase();
  if (/cancel|purged|inactive|unpaid|pending/i.test(s)) return false;
  if (channel === "bricklink") return /paid|packed|shipped|received|completed/i.test(s);
  return /complete|shipped|paid/i.test(s);
}
