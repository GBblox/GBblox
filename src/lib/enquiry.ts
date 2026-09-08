import type { LegoSet } from "./types";

function normalizeLocation(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 40);
}

export function normalizeScan(raw: string): string {
  return raw.replace(/[\r\n\t]/g, "").trim();
}

export function usedLocations(lots: LegoSet[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const lot of lots) {
    const loc = normalizeLocation(lot.location ?? "");
    if (!loc) continue;
    const key = loc.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(loc);
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

export function lotsAtLocation(lots: LegoSet[], raw: string): LegoSet[] {
  const needle = normalizeLocation(raw).toLowerCase();
  if (!needle) return [];
  return lots
    .filter((l) => normalizeLocation(l.location ?? "").toLowerCase() === needle)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function knownLocations(lots: LegoSet[], saved: string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const loc of [...saved, ...usedLocations(lots)]) {
    const n = normalizeLocation(loc);
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

export function isLocationCode(lots: LegoSet[], saved: string[], raw: string): boolean {
  const needle = normalizeScan(raw).toLowerCase();
  if (!needle) return false;
  return knownLocations(lots, saved).some((l) => l.toLowerCase() === needle);
}

export function lotMatchesQuery(lot: LegoSet, raw: string): boolean {
  const needle = normalizeScan(raw).toLowerCase();
  if (!needle) return false;
  const fields = [
    lot.sku,
    lot.location,
    lot.setNum,
    lot.name,
    lot.theme,
    lot.category,
    lot.subCategory,
    lot.notes,
  ];
  return fields.some((f) => (f ?? "").toLowerCase().includes(needle));
}

export function exactSkuMatch(lots: LegoSet[], raw: string): LegoSet | null {
  const needle = normalizeScan(raw).toUpperCase();
  if (!needle) return null;
  return lots.find((l) => l.sku.trim().toUpperCase() === needle) ?? null;
}

export type EnquiryHit = {
  mode: "empty" | "location" | "product";
  location: string | null;
  lots: LegoSet[];
};

export function runEnquiry(lots: LegoSet[], raw: string, savedLocations: string[] = []): EnquiryHit {
  const needle = normalizeScan(raw);
  if (!needle) return { mode: "empty", location: null, lots: [] };

  const sku = exactSkuMatch(lots, needle);
  if (sku) {
    const rest = lots.filter((l) => l.id !== sku.id && lotMatchesQuery(l, needle));
    return { mode: "product", location: sku.location || null, lots: [sku, ...rest] };
  }

  if (isLocationCode(lots, savedLocations, needle)) {
    const at = lotsAtLocation(lots, needle);
    const canonical = at[0]?.location || knownLocations(lots, savedLocations).find((l) => l.toLowerCase() === needle.toLowerCase()) || needle;
    return { mode: "location", location: canonical, lots: at };
  }

  const rest = lots.filter((l) => lotMatchesQuery(l, needle));
  return { mode: "product", location: null, lots: rest };
}

export function filterLots(lots: LegoSet[], opts: { location?: string; query?: string }): LegoSet[] {
  const loc = normalizeLocation(opts.location ?? "");
  const q = normalizeScan(opts.query ?? "");
  let rows = lots;
  if (loc) rows = lotsAtLocation(rows, loc);
  if (q && !isLocationCode(lots, [], q)) {
    rows = rows.filter((l) => lotMatchesQuery(l, q));
  } else if (q && isLocationCode(lots, [], q) && !loc) {
    rows = lotsAtLocation(rows, q);
  }
  return rows;
}
