import { gunzipSync } from "node:zlib";
import { applyDetails, fetchExternalCatalog } from "./bricklink";
import {
  brickEconomyToHit,
  fetchBrickEconomyDetails,
  searchBrickEconomy,
} from "./brickeconomy";
import {
  bricklinkCredsFrom,
  bricklinkImageUrl,
  fetchBricklinkCatalogItem,
  type BricklinkCreds,
} from "./bricklink-store";
import { bricklinkUrl, detectItemType, rebrickableBuyUrl } from "./format";
import type { CatalogHit, ItemType, SellerSettings } from "./types";

export { bricklinkUrl, rebrickableBuyUrl };

const SETS_URL = "https://cdn.rebrickable.com/media/downloads/sets.csv.gz";
const THEMES_URL = "https://cdn.rebrickable.com/media/downloads/themes.csv.gz";
const MINIFIGS_URL = "https://cdn.rebrickable.com/media/downloads/minifigs.csv.gz";
const RB_API = "https://rebrickable.com/api/v3/lego";
const STALE_MS = 12 * 60 * 60 * 1000;

type CatalogSet = {
  setNum: string;
  name: string;
  year: number | null;
  themeId: number | null;
  numParts: number | null;
  imageUrl: string | null;
};

type CatalogFig = {
  figNum: string;
  name: string;
  numParts: number | null;
  imageUrl: string | null;
};

type Theme = { id: number; name: string; parentId: number | null };

type CatalogCache = {
  loadedAt: number;
  byNum: Map<string, CatalogSet>;
  list: CatalogSet[];
  themes: Map<number, Theme>;
  figsByNum: Map<string, CatalogFig>;
  figs: CatalogFig[];
};

const g = globalThis as typeof globalThis & {
  __rbCatalog__?: CatalogCache;
  __rbCatalogPromise__?: Promise<CatalogCache>;
};

const THEME_GROUPS = new Set([
  "Licensed",
  "Other",
  "Miscellaneous",
  "Educational and Dacta",
  "Service Packs",
  "Bulk Bricks",
  "Universal Building Set",
]);

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cur = "";
    } else {
      cur += c;
    }
  }
  if (cur.length || row.length) {
    row.push(cur.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

async function fetchGzCsv(url: string): Promise<string[][]> {
  const res = await fetch(url, { headers: { Accept: "application/gzip" } });
  if (!res.ok) throw new Error(`Catalog download failed (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const text = gunzipSync(buf).toString("utf8");
  return parseCsv(text);
}

async function loadCatalog(): Promise<CatalogCache> {
  const existing = g.__rbCatalog__;
  if (existing && Date.now() - existing.loadedAt < STALE_MS) return existing;
  if (g.__rbCatalogPromise__) return g.__rbCatalogPromise__;

  g.__rbCatalogPromise__ = (async () => {
    const [setRows, themeRows, figRows] = await Promise.all([
      fetchGzCsv(SETS_URL),
      fetchGzCsv(THEMES_URL),
      fetchGzCsv(MINIFIGS_URL).catch(() => [] as string[][]),
    ]);
    const themes = new Map<number, Theme>();
    for (let i = 1; i < themeRows.length; i += 1) {
      const [id, name, parentId] = themeRows[i] ?? [];
      const n = Number(id);
      if (!Number.isFinite(n) || !name) continue;
      const p = parentId ? Number(parentId) : NaN;
      themes.set(n, { id: n, name, parentId: Number.isFinite(p) ? p : null });
    }
    const byNum = new Map<string, CatalogSet>();
    const list: CatalogSet[] = [];
    for (let i = 1; i < setRows.length; i += 1) {
      const [setNum, name, year, themeId, numParts, img] = setRows[i] ?? [];
      if (!setNum || !name) continue;
      const rec: CatalogSet = {
        setNum,
        name,
        year: year ? Number(year) || null : null,
        themeId: themeId ? Number(themeId) || null : null,
        numParts: numParts ? Number(numParts) || null : null,
        imageUrl: img || null,
      };
      byNum.set(setNum.toLowerCase(), rec);
      list.push(rec);
    }
    const figsByNum = new Map<string, CatalogFig>();
    const figs: CatalogFig[] = [];
    for (let i = 1; i < figRows.length; i += 1) {
      const [figNum, name, numParts, img] = figRows[i] ?? [];
      if (!figNum || !name) continue;
      const rec: CatalogFig = {
        figNum,
        name,
        numParts: numParts ? Number(numParts) || null : null,
        imageUrl: img || null,
      };
      figsByNum.set(figNum.toLowerCase(), rec);
      figs.push(rec);
    }
    const cache: CatalogCache = { loadedAt: Date.now(), byNum, list, themes, figsByNum, figs };
    g.__rbCatalog__ = cache;
    return cache;
  })().finally(() => {
    g.__rbCatalogPromise__ = undefined;
  });

  return g.__rbCatalogPromise__;
}

export function splitTheme(themeId: number | null, themes: Map<number, Theme>): {
  category: string | null;
  subCategory: string | null;
  theme: string | null;
} {
  if (themeId == null) return { category: null, subCategory: null, theme: null };
  const leaf = themes.get(themeId);
  if (!leaf) return { category: null, subCategory: null, theme: null };
  const parent = leaf.parentId != null ? themes.get(leaf.parentId) : undefined;
  if (!parent || THEME_GROUPS.has(parent.name)) {
    return { category: leaf.name, subCategory: null, theme: leaf.name };
  }
  return { category: parent.name, subCategory: leaf.name, theme: leaf.name };
}

function toSetHit(set: CatalogSet, themes: Map<number, Theme>): CatalogHit {
  const split = splitTheme(set.themeId, themes);
  return {
    itemType: "set",
    setNum: set.setNum,
    name: set.name,
    year: set.year,
    theme: split.theme,
    themeId: set.themeId,
    category: split.category,
    subCategory: split.subCategory,
    weightGrams: null,
    numParts: set.numParts,
    imageUrl: set.imageUrl,
    rebrickableUrl: `https://rebrickable.com/sets/${set.setNum}/`,
    retailPrice: null,
  };
}

function toFigHit(fig: CatalogFig): CatalogHit {
  return {
    itemType: "minifig",
    setNum: fig.figNum,
    name: fig.name,
    year: null,
    theme: "Minifigures",
    themeId: null,
    category: "Minifigures",
    subCategory: null,
    weightGrams: null,
    numParts: fig.numParts,
    imageUrl: fig.imageUrl,
    rebrickableUrl: `https://rebrickable.com/minifigs/${fig.figNum}/`,
    retailPrice: null,
  };
}

function scoreSet(query: string, set: CatalogSet): number {
  const q = query.toLowerCase();
  const num = set.setNum.toLowerCase();
  const bare = num.replace(/-1$/, "");
  const name = set.name.toLowerCase();
  if (num === q || bare === q) return 100;
  if (num.startsWith(`${q}-`) || num.startsWith(q)) return 80;
  if (bare.startsWith(q)) return 70;
  if (name === q) return 60;
  if (name.startsWith(q)) return 50;
  if (name.includes(q)) return 30;
  return 0;
}

function scoreFig(query: string, fig: CatalogFig): number {
  const q = query.toLowerCase();
  const num = fig.figNum.toLowerCase();
  const name = fig.name.toLowerCase();
  if (num === q) return 100;
  if (num.startsWith(q)) return 80;
  if (name === q) return 60;
  if (name.startsWith(q)) return 50;
  if (name.includes(q)) return 30;
  return 0;
}

function sameLot(a: CatalogHit, b: Pick<CatalogHit, "itemType" | "setNum">): boolean {
  return a.itemType === b.itemType && a.setNum.toLowerCase() === b.setNum.toLowerCase();
}

function preferImage(primary: string | null | undefined, fallback: string | null | undefined): string | null {
  if (primary && !/ItemImage\/MN\//i.test(primary)) return primary;
  return fallback || primary || null;
}

function mergeHit(base: CatalogHit, extra: CatalogHit): CatalogHit {
  const placeholder = !base.name || base.name.toLowerCase() === base.setNum.toLowerCase();
  return {
    ...base,
    name: placeholder && extra.name ? extra.name : base.name || extra.name,
    year: base.year ?? extra.year,
    theme: base.theme ?? extra.theme,
    themeId: base.themeId ?? extra.themeId,
    category: base.category ?? extra.category,
    subCategory: base.subCategory ?? extra.subCategory,
    weightGrams: base.weightGrams ?? extra.weightGrams,
    numParts: base.numParts ?? extra.numParts,
    imageUrl: preferImage(base.imageUrl, extra.imageUrl),
    rebrickableUrl: base.rebrickableUrl || extra.rebrickableUrl,
    retailPrice: base.retailPrice ?? extra.retailPrice,
  };
}

function pushHit(hits: CatalogHit[], hit: CatalogHit) {
  const i = hits.findIndex((h) => sameLot(h, hit));
  if (i >= 0) hits[i] = mergeHit(hits[i], hit);
  else hits.push(hit);
}

function emptyHit(itemNo: string, itemType: ItemType): CatalogHit {
  return {
    itemType,
    setNum: itemNo,
    name: itemNo,
    year: null,
    theme: itemType === "minifig" ? "Minifigures" : null,
    themeId: null,
    category: itemType === "minifig" ? "Minifigures" : null,
    subCategory: null,
    weightGrams: null,
    numParts: null,
    imageUrl: bricklinkImageUrl(itemType, itemNo),
    rebrickableUrl: rebrickableBuyUrl(itemNo, itemType),
    retailPrice: null,
  };
}

async function bricklinkHit(
  itemNo: string,
  itemType: ItemType,
  creds: BricklinkCreds | null,
): Promise<CatalogHit | null> {
  if (creds) {
    const item = await fetchBricklinkCatalogItem(creds, itemType, itemNo);
    if (item) {
      return {
        itemType,
        setNum: item.itemNo,
        name: item.name,
        year: item.year,
        theme: item.subCategory || item.category,
        themeId: null,
        category: item.category,
        subCategory: item.subCategory,
        weightGrams: item.weightGrams,
        numParts: null,
        imageUrl: item.imageUrl,
        rebrickableUrl: rebrickableBuyUrl(item.itemNo, itemType),
        retailPrice: null,
      };
    }
  }
  const extra = await fetchExternalCatalog(itemNo, itemType);
  if (!extra.name && extra.year == null && extra.category == null && extra.weightGrams == null) {
    return null;
  }
  const no = itemType === "set" && !itemNo.includes("-") ? `${itemNo}-1` : itemNo;
  return applyDetails(emptyHit(no, itemType), extra);
}

export async function enrichCatalogHit(
  hit: CatalogHit,
  creds?: BricklinkCreds | null,
): Promise<CatalogHit> {
  let next = hit;
  if (creds) {
    const bl = await bricklinkHit(hit.setNum, hit.itemType, creds);
    if (bl) next = mergeHit(bl, next);
  }
  if (!next.year || !next.category || !next.name || next.name.toLowerCase() === next.setNum.toLowerCase() || !next.weightGrams) {
    try {
      const be = await fetchBrickEconomyDetails(hit.setNum, hit.itemType);
      if (be) next = mergeHit(next, brickEconomyToHit(be));
    } catch {
      /* BrickEconomy is a fallback */
    }
  }
  if (!next.year || !next.weightGrams || next.name.toLowerCase() === next.setNum.toLowerCase()) {
    const extra = await fetchExternalCatalog(hit.setNum, hit.itemType);
    next = applyDetails(next, extra);
  }
  return next;
}

export type CatalogSearchOpts = {
  apiKey?: string;
  itemType?: ItemType | "all";
  blCreds?: BricklinkCreds | null;
};

export async function searchCatalog(query: string, opts: CatalogSearchOpts | string = {}): Promise<CatalogHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const options: CatalogSearchOpts = typeof opts === "string" ? { apiKey: opts } : opts;
  const lower = q.toLowerCase();
  const requested = options.itemType ?? "all";
  const kind: ItemType | "all" = requested === "all" ? detectItemType(q) : requested;
  const wantSet = kind !== "minifig";
  const wantFig = kind !== "set";
  const creds = options.blCreds ?? null;
  const wantBe = wantFig;
  const needRb = wantSet || /^fig-/i.test(q);
  const blType: ItemType | null = kind === "minifig" || kind === "set" ? kind : null;

  const [catalog, beHits, bl] = await Promise.all([
    needRb ? loadCatalog() : Promise.resolve(null),
    wantBe ? searchBrickEconomy(q).catch(() => []) : Promise.resolve([]),
    blType ? bricklinkHit(q, blType, creds).catch(() => null) : Promise.resolve(null),
  ]);

  const hits: CatalogHit[] = [];
  if (bl) pushHit(hits, bl);

  for (const be of beHits) {
    if (be.itemType === "minifig" && !wantFig) continue;
    if (be.itemType === "set" && !wantSet) continue;
    pushHit(hits, brickEconomyToHit(be));
  }

  if (catalog && wantSet) {
    const exact = catalog.byNum.get(lower) ?? catalog.byNum.get(`${lower}-1`);
    const ranked = catalog.list
      .map((s) => ({ s, score: scoreSet(lower, s) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || (b.s.year ?? 0) - (a.s.year ?? 0))
      .slice(0, 8)
      .map((x) => toSetHit(x.s, catalog.themes));
    if (exact && !ranked.some((h) => h.setNum === exact.setNum)) {
      ranked.unshift(toSetHit(exact, catalog.themes));
    }
    for (const hit of ranked) pushHit(hits, hit);
  }

  if (catalog && wantFig) {
    const exactFig = catalog.figsByNum.get(lower);
    const ranked = catalog.figs
      .map((f) => ({ f, score: scoreFig(lower, f) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => toFigHit(x.f));
    if (exactFig && !ranked.some((h) => h.setNum === exactFig.figNum)) {
      ranked.unshift(toFigHit(exactFig));
    }
    for (const hit of ranked) {
      // Rebrickable fig-xxxx IDs are not BrickLink item numbers — keep them
      // only when nothing matched the BrickLink-style query.
      if (hits.some((h) => h.itemType === "minifig") && /^fig-/i.test(hit.setNum) && !/^fig-/i.test(q)) {
        continue;
      }
      pushHit(hits, hit);
    }
  }

  if (hits.length === 0 && options.apiKey?.trim() && wantSet) {
    const themes = catalog?.themes ?? new Map();
    const url = `${RB_API}/sets/?search=${encodeURIComponent(q)}&page_size=8`;
    const res = await fetch(url, {
      headers: { Authorization: `key ${options.apiKey.trim()}`, Accept: "application/json" },
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error("Rebrickable API key was rejected. Check it in Settings.");
    }
    if (res.ok) {
      const json = (await res.json()) as {
        results?: Array<{
          set_num: string;
          name: string;
          year: number;
          theme_id: number;
          num_parts: number;
          set_img_url: string | null;
          set_url: string;
        }>;
      };
      for (const r of json.results ?? []) {
        const split = splitTheme(r.theme_id ?? null, themes);
        pushHit(hits, {
          itemType: "set",
          setNum: r.set_num,
          name: r.name,
          year: r.year ?? null,
          theme: split.theme,
          themeId: r.theme_id ?? null,
          category: split.category,
          subCategory: split.subCategory,
          weightGrams: null,
          numParts: r.num_parts ?? null,
          imageUrl: r.set_img_url,
          rebrickableUrl: r.set_url || `https://rebrickable.com/sets/${r.set_num}/`,
          retailPrice: null,
        });
      }
    }
  }

  if (hits.length === 0 && wantFig && /^[a-z]{1,8}\d/i.test(q)) {
    hits.push(emptyHit(q, "minifig"));
  }

  return hits.slice(0, 10);
}

export function credsFromSettings(settings?: Partial<SellerSettings> | null): BricklinkCreds | null {
  if (!settings) return null;
  return bricklinkCredsFrom({
    blConsumerKey: settings.blConsumerKey ?? "",
    blConsumerSecret: settings.blConsumerSecret ?? "",
    blToken: settings.blToken ?? "",
    blTokenSecret: settings.blTokenSecret ?? "",
  });
}
