import type { LegoSet } from "./types";

export type EbayStoreCategory = { id: string; name: string; parentId: string | null };

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
): { category: EbayStoreCategory | null; subCategory: EbayStoreCategory | null } {
  const themeNeedles = [
    set.category,
    set.theme,
    set.itemType === "minifig" ? "Minifigures" : "Sets",
    set.itemType === "minifig" ? "Minifigure" : "Set",
  ].filter((s): s is string => Boolean(s?.trim()));
  const subNeedles = [set.subCategory].filter((s): s is string => Boolean(s?.trim()));
  const parents = cats.filter((c) => !c.parentId);
  const kids = (id: string) => cats.filter((c) => c.parentId === id);

  let category = bestStoreCat(parents, themeNeedles);
  let subCategory = category && subNeedles.length ? bestStoreCat(kids(category.id), subNeedles) : null;

  if (!subCategory && subNeedles.length) {
    const child = bestStoreCat(
      cats.filter((c) => c.parentId),
      subNeedles,
    );
    if (child) {
      subCategory = child;
      category = cats.find((c) => c.id === child.parentId) ?? category;
    }
  }
  if (!category) {
    const any = bestStoreCat(cats, [...subNeedles, ...themeNeedles]);
    if (any) {
      if (any.parentId) {
        category = cats.find((c) => c.id === any.parentId) ?? any;
        subCategory = any;
      } else {
        category = any;
      }
    }
  }
  if (subCategory && category && subCategory.id === category.id) subCategory = null;
  return { category, subCategory };
}
