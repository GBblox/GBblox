import type { CatalogHit, ItemType } from "./types";
import { decodeEntities } from "./format";
import { extractBricklinkPair, isPlaceholderCatalogName, usefulSubcategory } from "./theme-path";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export type CatalogDetails = {
  name: string | null;
  category: string | null;
  subCategory: string | null;
  year: number | null;
  weightGrams: number | null;
  source: string | null;
};

function parseYear(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = value.match(/\b(19|20)\d{2}\b/);
  if (!m) return null;
  const n = Number(m[0]);
  return n >= 1949 && n <= 2099 ? n : null;
}

function parseWeight(value: string | null | undefined): number | null {
  if (!value) return null;
  const kg = value.match(/([\d.,]+)\s*kg\b/i);
  if (kg) {
    const n = Number(kg[1].replace(/,/g, ""));
    return Number.isFinite(n) ? Math.round(n * 1000) : null;
  }
  const g = value.match(/([\d.,]+)\s*g\b/i);
  if (g) {
    const n = Number(g[1].replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function fetchText(url: string, ms = 6000): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (/human verification|captcha-container|awsWaf/i.test(html)) return null;
    return html;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function bricklinkThemePair(html: string, itemType: ItemType): { category: string | null; subCategory: string | null } {
  const pair = extractBricklinkPair(html);
  return {
    category: pair.category || (itemType === "minifig" ? "Minifigures" : null),
    subCategory: pair.subCategory,
  };
}

export function parseBrickLink(html: string, itemType: ItemType): CatalogDetails {
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? "";
  const nameFromTitle = title
    .replace(/\s*:\s*(Set|Minifigure|Minifig)\s+\S+\s*\|\s*BrickLink.*$/i, "")
    .replace(/\s*\|\s*BrickLink.*$/i, "")
    .replace(/^[a-z]{1,8}\d+[a-z0-9]*\s+/i, "")
    .trim();

  const year =
    parseYear(html.match(/Year Released:\s*<\/[^>]+>\s*(?:<a[^>]*>)?\s*(\d{4})/i)?.[1]) ??
    parseYear(html.match(/Year Released:\s*(\d{4})/i)?.[1]);

  const weight =
    parseWeight(html.match(/Weight:\s*<\/[^>]+>\s*([^<]+)/i)?.[1]) ??
    parseWeight(html.match(/Weight:\s*([\d.,]+\s*g)/i)?.[1]);

  const { category, subCategory } = bricklinkThemePair(html, itemType);

  return {
    name: nameFromTitle ? decodeEntities(nameFromTitle) : null,
    category,
    subCategory: usefulSubcategory(subCategory, category, nameFromTitle),
    year,
    weightGrams: weight,
    source: "bricklink",
  };
}

function mergeDetails(...layers: CatalogDetails[]): CatalogDetails {
  const out: CatalogDetails = {
    name: null,
    category: null,
    subCategory: null,
    year: null,
    weightGrams: null,
    source: null,
  };
  const sources: string[] = [];
  for (const layer of layers) {
    if (layer.name && !isPlaceholderCatalogName(layer.name) && !out.name) out.name = layer.name;
    if (layer.category && !out.category) out.category = layer.category;
    if (layer.subCategory && !out.subCategory) {
      out.subCategory = usefulSubcategory(layer.subCategory, out.category || layer.category, out.name);
    }
    if (layer.year != null && out.year == null) out.year = layer.year;
    if (layer.weightGrams != null && out.weightGrams == null) out.weightGrams = layer.weightGrams;
    if (layer.source) sources.push(layer.source);
  }
  if (out.subCategory && out.subCategory === out.category) out.subCategory = null;
  out.source = sources.length ? [...new Set(sources)].join("+") : null;
  return out;
}

export async function fetchExternalCatalog(
  setNum: string,
  itemType: ItemType = "set",
): Promise<CatalogDetails> {
  const num = setNum.trim();
  const key = itemType === "minifig" ? "M" : "S";
  const no = itemType === "set" && !num.includes("-") ? `${num}-1` : num;
  const html = await fetchText(
    `https://www.bricklink.com/v2/catalog/catalogitem.page?${key}=${encodeURIComponent(no)}`,
  );
  return html ? parseBrickLink(html, itemType) : mergeDetails();
}

export function applyDetails(hit: CatalogHit, extra: CatalogDetails): CatalogHit {
  const extraName = extra.name && !isPlaceholderCatalogName(extra.name, hit.setNum) ? extra.name : null;
  const name = extraName || hit.name;
  return {
    ...hit,
    name: decodeEntities(name),
    year: extra.year ?? hit.year,
    category: extra.category ? decodeEntities(extra.category) : hit.category ? decodeEntities(hit.category) : null,
    subCategory:
      usefulSubcategory(extra.subCategory, extra.category || hit.category, extraName || hit.name) ??
      usefulSubcategory(hit.subCategory, extra.category || hit.category, extraName || hit.name),
    weightGrams: extra.weightGrams ?? hit.weightGrams,
    theme: decodeEntities(extra.subCategory || extra.category || hit.theme || "") || hit.theme,
  };
}
