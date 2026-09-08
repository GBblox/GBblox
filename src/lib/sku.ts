import type { ItemType } from "./types";

export function skuTypeCode(itemType: ItemType = "set"): "SET" | "MINIFIG" {
  return itemType === "minifig" ? "MINIFIG" : "SET";
}

export function skuPrefix(_itemNo: string, itemType: ItemType = "set"): string {
  return `GBB-${skuTypeCode(itemType)}-`;
}

export function formatSku(itemNo: string, itemType: ItemType = "set", seq = 1): string {
  const n = Math.max(1, Math.floor(Number(seq) || 1));
  const pad = n < 10_000 ? String(n).padStart(4, "0") : String(n);
  return `${skuPrefix(itemNo, itemType)}${pad}`;
}

/** Preview helper. Server assigns the next free sequence on save. */
export function generateSku(setNum: string, itemType: ItemType = "set", seq = 1): string {
  return formatSku(setNum, itemType, seq);
}

export function nextSequence(existingSkus: string[], prefix: string): number {
  const upper = prefix.toUpperCase();
  let max = 0;
  for (const raw of existingSkus) {
    const sku = raw.trim().toUpperCase();
    if (!sku.startsWith(upper)) continue;
    const tail = sku.slice(upper.length);
    if (!/^\d+$/.test(tail)) continue;
    const n = Number(tail);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

export function looksLikeAutoSku(sku: string, itemNo: string, itemType: ItemType): boolean {
  const prefix = skuPrefix(itemNo, itemType);
  const normalized = normalizeSku(sku);
  if (!normalized.startsWith(prefix)) return false;
  return /^\d+$/.test(normalized.slice(prefix.length));
}

export function normalizeSku(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "-");
}

export function isValidSku(raw: string): boolean {
  const sku = normalizeSku(raw);
  return /^[A-Z0-9._-]{3,50}$/.test(sku);
}

export function skuMatchesRemarks(sku: string, remarks: string): boolean {
  const a = normalizeSku(sku);
  const b = normalizeSku(remarks);
  return Boolean(a) && a === b;
}
