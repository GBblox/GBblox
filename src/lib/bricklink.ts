import type { CatalogHit, ItemType } from "./types";
import { decodeEntities } from "./format";

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

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&/gi, "&")
    .replace(/"/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

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

function dtMap(html: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const key = stripTags(m[1]).toLowerCase();
    const val = stripTags(m[2]);
    if (key && val) map.set(key, val);
  }
  return map;
}

function parseBrickset(html: string): CatalogDetails {
  const facts = dtMap(html);
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? "";
  const nameFromTitle = title.replace(/\s*\|\s*Brickset.*$/i, "").replace(/^LEGO\s+\d+\S*\s+/i, "").trim();
  return {
    name: facts.get("name") || nameFromTitle || null,
    category: facts.get("theme") || null,
    subCategory: facts.get("subtheme") || null,
    year: parseYear(facts.get("year released") || facts.get("year")),
    weightGrams: parseWeight(facts.get("weight") || facts.get("packaging weight") || facts.get("item weight")),
    source: "brickset",
  };
}

function parseBrickLink(html: string, itemType: ItemType): CatalogDetails {
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

  const crumb = stripTags(
    html.match(/Catalog[\s\S]{0,500}?(Set Entry|Minifig Entry|Minifigure)/i)?.[0] ??
      html.match(/catType=[SM][\s\S]{0,800}/i)?.[0] ??
      "",
  );
  const skip = /^(catalog|sets?|minifigures?|minifigs?|set entry|minifig entry)$/i;
  const parts = crumb
    .split(/[:›>]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !skip.test(s) && !/^\d/.test(s));

  return {
    name: nameFromTitle ? decodeEntities(nameFromTitle) : null,
    category: parts[0] ? decodeEntities(parts[0]) : itemType === "minifig" ? "Minifigures" : null,
    subCategory: parts[1] && parts[1] !== parts[0] ? decodeEntities(parts[1]) : null,
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
    if (layer.name && !out.name) out.name = layer.name;
    if (layer.category && !out.category) out.category = layer.category;
    if (layer.subCategory && !out.subCategory) out.subCategory = layer.subCategory;
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
  if (itemType === "minifig") {
    const html = await fetchText(
      `https://www.bricklink.com/v2/catalog/catalogitem.page?M=${encodeURIComponent(num)}`,
    );
    return html ? parseBrickLink(html, "minifig") : mergeDetails();
  }
  const withSuffix = num.includes("-") ? num : `${num}-1`;
  const [blHtml, bsHtml] = await Promise.all([
    fetchText(`https://www.bricklink.com/v2/catalog/catalogitem.page?S=${encodeURIComponent(withSuffix)}`),
    fetchText(`https://brickset.com/sets/${encodeURIComponent(withSuffix)}`),
  ]);
  const layers: CatalogDetails[] = [];
  if (blHtml) layers.push(parseBrickLink(blHtml, "set"));
  if (bsHtml) layers.push(parseBrickset(bsHtml));
  return mergeDetails(...layers);
}

export function applyDetails(hit: CatalogHit, extra: CatalogDetails): CatalogHit {
  return {
    ...hit,
    name: decodeEntities(extra.name || hit.name),
    year: extra.year ?? hit.year,
    category: extra.category ? decodeEntities(extra.category) : hit.category ? decodeEntities(hit.category) : null,
    subCategory: extra.subCategory ? decodeEntities(extra.subCategory) : hit.subCategory ? decodeEntities(hit.subCategory) : null,
    weightGrams: extra.weightGrams ?? hit.weightGrams,
    theme: decodeEntities(extra.subCategory || extra.category || hit.theme || "") || hit.theme,
  };
}
