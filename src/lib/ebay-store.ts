import type { LegoSet } from "./types";

export type EbayStoreCategory = { id: string; name: string; parentId: string | null };

export type StoreMapping = {
  category: EbayStoreCategory | null;
  subCategory: EbayStoreCategory | null;
  subSubCategory: EbayStoreCategory | null;
};

export function parseEbayStoreCategories(body: string): EbayStoreCategory[] {
  const out: EbayStoreCategory[] = [];
  const stack: EbayStoreCategory[] = [];
  const re = /<\/?(?:CustomCategory|ChildCategory)>|<CategoryID>([^<]*)<\/CategoryID>|<Name>([^<]*)<\/Name>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const tag = m[0];
    if (/^<(CustomCategory|ChildCategory)>/i.test(tag)) {
      stack.push({ id: "", name: "", parentId: stack.at(-1)?.id || null });
    } else if (/^<\/(CustomCategory|ChildCategory)>/i.test(tag)) {
      const node = stack.pop();
      if (node?.id && node.name) out.push(node);
    } else if (m[1] != null && stack.length) {
      const cur = stack.at(-1)!;
      if (!cur.id) cur.id = m[1].trim();
    } else if (m[2] != null && stack.length) {
      const cur = stack.at(-1)!;
      if (!cur.name) cur.name = m[2].trim().replace(/&/g, "&");
    }
  }
  return out;
}

export function storeChildren(cats: EbayStoreCategory[], parentId: string | null): EbayStoreCategory[] {
  return cats.filter((c) => (c.parentId ?? null) === parentId);
}

export function storePath(cats: EbayStoreCategory[], id: string | null | undefined): EbayStoreCategory[] {
  if (!id) return [];
  const byId = new Map(cats.map((c) => [c.id, c]));
  const path: EbayStoreCategory[] = [];
  const seen = new Set<string>();
  let cur = byId.get(id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path.slice(0, 3);
}

export function mappingFromPath(path: EbayStoreCategory[]): StoreMapping {
  return {
    category: path[0] ?? null,
    subCategory: path[1] ?? null,
    subSubCategory: path[2] ?? null,
  };
}

function normCat(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function nameScore(name: string, needles: string[]): number {
  const n = normCat(name);
  if (!n) return 0;
  let best = 0;
  for (const raw of needles) {
    const q = normCat(raw);
    if (!q) continue;
    if (n === q) best = Math.max(best, 100);
    else if (n.includes(q) || q.includes(n)) best = Math.max(best, 70);
  }
  return best;
}

function bestStoreCat(cats: EbayStoreCategory[], needles: string[]): EbayStoreCategory | null {
  let hit: EbayStoreCategory | null = null;
  let score = 0;
  for (const cat of cats) {
    const s = nameScore(cat.name, needles);
    if (s > score) {
      score = s;
      hit = cat;
    }
  }
  return score >= 70 ? hit : null;
}

export function pickStoreMapping(
  cats: EbayStoreCategory[],
  set: Pick<LegoSet, "category" | "subCategory" | "theme" | "itemType">,
): StoreMapping {
  const themeNeedles = [
    set.category,
    set.theme,
    set.itemType === "minifig" ? "Minifigures" : "Sets",
    set.itemType === "minifig" ? "Minifigure" : "Set",
  ].filter((s): s is string => Boolean(s?.trim()));
  const subNeedles = [set.subCategory].filter((s): s is string => Boolean(s?.trim()));
  const roots = storeChildren(cats, null);

  const subHit = subNeedles.length ? bestStoreCat(cats, subNeedles) : null;
  if (subHit) {
    const path = storePath(cats, subHit.id);
    const l2 = path[1];
    const l3 = l2 ? bestStoreCat(storeChildren(cats, l2.id), subNeedles) : null;
    if (l3 && l3.id !== subHit.id && path.length < 3) {
      return mappingFromPath([...path, l3].slice(0, 3));
    }
    return mappingFromPath(path);
  }

  const themeHit = bestStoreCat(roots, themeNeedles) ?? bestStoreCat(cats, themeNeedles);
  if (themeHit) {
    const path = storePath(cats, themeHit.id);
    const l1 = path[0] ?? themeHit;
    const l2 = bestStoreCat(storeChildren(cats, l1.id), [...subNeedles, ...themeNeedles]);
    const l3 = l2 ? bestStoreCat(storeChildren(cats, l2.id), subNeedles) : null;
    return {
      category: l1,
      subCategory: l2,
      subSubCategory: l3,
    };
  }

  return { category: null, subCategory: null, subSubCategory: null };
}
