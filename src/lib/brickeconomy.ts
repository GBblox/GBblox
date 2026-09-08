import { rebrickableBuyUrl } from "./format";
import type { CatalogHit, ItemType } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const ORIGIN = "https://www.brickeconomy.com";
const STALE_MS = 30 * 60 * 1000;

export type BrickEconomyHit = {
  itemType: ItemType;
  itemNo: string;
  name: string;
  year: number | null;
  category: string | null;
  subCategory: string | null;
  numParts: number | null;
  imageUrl: string | null;
  path: string;
};

const g = globalThis as typeof globalThis & {
  __beSearch__?: Map<string, { at: number; hits: BrickEconomyHit[] }>;
};

function cache(): Map<string, { at: number; hits: BrickEconomyHit[] }> {
  g.__beSearch__ ??= new Map();
  return g.__beSearch__;
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&/gi, "&")
    .replace(/"/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/</gi, "<")
    .replace(/>/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url: string, ms = 8000): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export function brickEconomyImageUrl(itemType: ItemType, itemNo: string): string {
  if (itemType === "minifig") {
    return `${ORIGIN}/resources/images/minifigs/${encodeURIComponent(itemNo)}_medium.jpg`;
  }
  return `${ORIGIN}/resources/images/sets/lego-${encodeURIComponent(itemNo)}_medium.jpg`;
}

function absUrl(src: string | null | undefined): string | null {
  if (!src) return null;
  if (src.startsWith("http")) return src;
  return `${ORIGIN}${src.startsWith("/") ? "" : "/"}${src}`;
}

function parseYear(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = value.match(/\b(19|20)\d{2}\b/);
  if (!m) return null;
  const n = Number(m[0]);
  return n >= 1949 && n <= 2099 ? n : null;
}

function parseMinifigs(html: string): BrickEconomyHit[] {
  const hits: BrickEconomyHit[] = [];
  const seen = new Set<string>();
  const re =
    /href="(\/minifig\/([^"/?]+)\/([^"/?]+))"([^>]*)>[\s\S]{0,900}?setminifigpanel-name">([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const path = m[1];
    const itemNo = decodeURIComponent(m[2]);
    const key = itemNo.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const title = /title="([^"]*)"/.exec(m[4])?.[1] ?? "";
    const panelName = stripTags(m[5]);
    const fromTitle = title.replace(new RegExp(`\\s*-\\s*${itemNo}\\s*$`, "i"), "").trim();
    const name = panelName || fromTitle || itemNo;
    hits.push({
      itemType: "minifig",
      itemNo,
      name,
      year: null,
      category: null,
      subCategory: null,
      numParts: null,
      imageUrl: brickEconomyImageUrl("minifig", itemNo),
      path,
    });
  }
  if (hits.length) return hits;

  const loose = /href="(\/minifig\/([^"/?]+)\/([^"/?]+))"/gi;
  while ((m = loose.exec(html))) {
    const path = m[1];
    const itemNo = decodeURIComponent(m[2]);
    const slug = decodeURIComponent(m[3]).replace(/-/g, " ");
    const key = itemNo.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const name = slug.replace(/\b\w/g, (c) => c.toUpperCase()) || itemNo;
    hits.push({
      itemType: "minifig",
      itemNo,
      name,
      year: null,
      category: null,
      subCategory: null,
      numParts: null,
      imageUrl: brickEconomyImageUrl("minifig", itemNo),
      path,
    });
  }
  return hits;
}

function parseSets(html: string): BrickEconomyHit[] {
  const hits: BrickEconomyHit[] = [];
  const seen = new Set<string>();
  const re =
    /<h4>\s*<a href="(\/set\/([^"/?]+)\/([^"/?]+))">\s*([^<]+)<\/a>\s*<\/h4>([\s\S]{0,900}?)(?:Pieces\s*\/\s*Minifigs|Availability)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const path = m[1];
    const itemNo = decodeURIComponent(m[2]);
    const key = itemNo.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const heading = stripTags(m[4]);
    const rest = m[5] ?? "";
    const name = heading.replace(new RegExp(`^${itemNo.replace(/-1$/, "")}\\s+`, "i"), "").trim() || heading;
    const themeBlock = rest.match(/Theme\s*\/\s*Subtheme[\s\S]{0,400}/i)?.[0] ?? rest;
    const links = [...themeBlock.matchAll(/<a[^>]*>([^<]+)<\/a>/gi)].map((x) => stripTags(x[1]));
    const category = links[0] || null;
    const subCategory = links[1] && links[1] !== links[0] ? links[1] : null;
    const year = parseYear(rest.match(/Year<\/small>[\s\S]{0,200}/i)?.[0]);
    const pieces = rest.match(/Pieces\s*\/\s*Minifigs<\/small>\s*([\d,]+)/i)?.[1];
    const img = rest.match(/src="([^"]+\/sets\/[^"]+)"/i)?.[1];
    hits.push({
      itemType: "set",
      itemNo,
      name,
      year,
      category,
      subCategory,
      numParts: pieces ? Number(pieces.replace(/,/g, "")) || null : null,
      imageUrl: absUrl(img) || brickEconomyImageUrl("set", itemNo),
      path,
    });
  }
  return hits;
}

function rankHits(query: string, hits: BrickEconomyHit[]): BrickEconomyHit[] {
  const q = query.trim().toLowerCase();
  return hits
    .map((h) => {
      const no = h.itemNo.toLowerCase();
      const bare = no.replace(/-1$/, "");
      const name = h.name.toLowerCase();
      let score = 0;
      if (no === q || bare === q) score = 100;
      else if (no.startsWith(q) || bare.startsWith(q)) score = 80;
      else if (name === q) score = 60;
      else if (name.startsWith(q)) score = 50;
      else if (name.includes(q) || no.includes(q)) score = 30;
      else score = 10;
      return { h, score };
    })
    .sort((a, b) => b.score - a.score || a.h.itemNo.localeCompare(b.h.itemNo))
    .map((x) => x.h);
}

export async function searchBrickEconomy(query: string): Promise<BrickEconomyHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const key = q.toLowerCase();
  const cached = cache().get(key);
  if (cached && Date.now() - cached.at < STALE_MS) return cached.hits;

  const html = await fetchText(`${ORIGIN}/search?query=${encodeURIComponent(q)}`);
  if (!html) return [];
  const figs = parseMinifigs(html);
  const sets = parseSets(html);
  const hits = rankHits(q, [...figs, ...sets]).slice(0, 12);
  cache().set(key, { at: Date.now(), hits });
  return hits;
}

function parseDetailRows(html: string, containerId: string): Map<string, string> {
  const map = new Map<string, string>();
  const start = html.indexOf(`id="${containerId}"`);
  if (start < 0) return map;
  const block = html.slice(start, start + 5000);
  const re =
    /rowlist">\s*<div class="col-xs-5[^"]*">([\s\S]*?)<\/div>\s*<div class="col-xs-7[^"]*">([\s\S]*?)<\/div>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const label = stripTags(m[1]).toLowerCase();
    const value = stripTags(m[2]);
    if (label && value) map.set(label, value);
  }
  return map;
}

export async function fetchBrickEconomyDetails(
  itemNo: string,
  itemType: ItemType,
): Promise<BrickEconomyHit | null> {
  const search = await searchBrickEconomy(itemNo);
  const lower = itemNo.toLowerCase();
  const match =
    search.find((h) => h.itemType === itemType && h.itemNo.toLowerCase() === lower) ??
    search.find((h) => h.itemType === itemType && h.itemNo.toLowerCase().replace(/-1$/, "") === lower) ??
    search.find((h) => h.itemType === itemType && h.itemNo.toLowerCase().startsWith(lower)) ??
    search.find((h) => h.itemNo.toLowerCase() === lower) ??
    null;
  if (!match) return null;

  const html = await fetchText(`${ORIGIN}${match.path}`);
  if (!html) return match;

  const boxId = itemType === "minifig" ? "ContentPlaceHolder1_MinifigDetails" : "ContentPlaceHolder1_SetDetails";
  const rows = parseDetailRows(html, boxId);
  const name = rows.get("name") || match.name;
  const category = rows.get("theme") || match.category;
  const subCategory = rows.get("subtheme") || match.subCategory;
  const year = parseYear(rows.get("years") || rows.get("year") || rows.get("released")) ?? match.year;
  const h1 = stripTags(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "");
  const img =
    html.match(/src="(\/resources\/images\/minifigs\/[^"]+_medium\.[^"]+)"/i)?.[1] ||
    html.match(/src="(\/resources\/images\/sets\/[^"]+)"/i)?.[1];

  return {
    ...match,
    name: name.replace(/\s+Minifigure$/i, "").trim() || h1.replace(/\s+Minifigure$/i, "").trim() || match.name,
    year,
    category: category || match.category,
    subCategory: subCategory && subCategory !== category ? subCategory : match.subCategory,
    imageUrl: absUrl(img) || match.imageUrl,
  };
}

export function brickEconomyToHit(hit: BrickEconomyHit): CatalogHit {
  return {
    itemType: hit.itemType,
    setNum: hit.itemNo,
    name: hit.name,
    year: hit.year,
    theme: hit.subCategory || hit.category,
    themeId: null,
    category: hit.category,
    subCategory: hit.subCategory,
    weightGrams: null,
    numParts: hit.numParts,
    imageUrl: hit.imageUrl,
    rebrickableUrl: rebrickableBuyUrl(hit.itemNo, hit.itemType),
    retailPrice: null,
  };
}
