export type ThemeNode = { id: number; name: string; parentId: number | null };

const SKIP = /^(minifigures?|sets?|catalog|root|home|browse|normal)$/i;
const JUNK_SUB = /^(normal|category|sets?|minifigures?|entry|set entry|minifig entry)$/i;

export function themePath(
  id: number | null | undefined,
  nodes: Map<number, ThemeNode>,
  skipNames: ReadonlySet<string> = new Set(),
): string[] {
  if (id == null) return [];
  const names: string[] = [];
  const seen = new Set<number>();
  let cur = nodes.get(id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.name && !SKIP.test(cur.name) && !skipNames.has(cur.name)) names.unshift(cur.name);
    cur = cur.parentId != null ? nodes.get(cur.parentId) : undefined;
  }
  return names;
}

export function splitThemePath(path: string[]): { category: string | null; subCategory: string | null } {
  const category = path[0] ?? null;
  const subCategory = usefulSubcategory(path[1] ?? null, category);
  return { category, subCategory };
}

export function isPlaceholderCatalogName(name: string | null | undefined, itemNo?: string | null): boolean {
  const n = (name ?? "").replace(/\s+/g, " ").trim();
  if (!n) return true;
  const stripped = n.replace(/^lego\s+/i, "").trim();
  const item = (itemNo ?? "").trim().toLowerCase();
  if (!stripped) return true;
  if (!item) return stripped.length < 2;
  const lower = stripped.toLowerCase();
  if (lower === item) return true;
  if (lower === item.replace(/-1$/, "")) return true;
  return false;
}

export function usefulSubcategory(
  value: string | null | undefined,
  category?: string | null,
  name?: string | null,
): string | null {
  const v = (value ?? "").replace(/\s+/g, " ").trim();
  if (!v) return null;
  if (JUNK_SUB.test(v) || SKIP.test(v)) return null;
  if (/^\d/.test(v)) return null;
  if (/entry$/i.test(v)) return null;
  if (category && v.toLowerCase() === category.trim().toLowerCase()) return null;
  if (name && v.toLowerCase() === name.trim().toLowerCase()) return null;
  return v;
}

export function slugToName(slug: string | null | undefined): string | null {
  const s = (slug ?? "").trim();
  if (!s) return null;
  return s.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim() || null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&/gi, "&")
    .replace(/"/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractBricksetPair(html: string): { category: string | null; subCategory: string | null } {
  const subHref = html.match(/\/sets\/theme-[^"/]+\/subtheme-([^"/?]+)\/?["'?]/i)?.[1];
  const subText =
    stripHtml(html.match(/\/sets\/theme-[^"/]+\/subtheme-[^"/?]+\/?["'][^>]*>([^<]+)</i)?.[1] ?? "") ||
    stripHtml(html.match(/Subtheme\s*<\/[^>]+>\s*<(?:dd|td|div|span|a)[^>]*>\s*([^<]+)/i)?.[1] ?? "") ||
    slugToName(subHref);
  const catText =
    stripHtml(html.match(/\/sets\/theme-[^"/?]+\/?["'][^>]*>([^<]+)</i)?.[1] ?? "") ||
    stripHtml(html.match(/>Theme\s*<\/[^>]+>\s*<(?:dd|td|div|span|a)[^>]*>\s*([^<]+)/i)?.[1] ?? "");
  const category = catText || slugToName(html.match(/\/sets\/theme-([^"/?]+)/i)?.[1]);
  return { category, subCategory: usefulSubcategory(subText, category) };
}

export function extractBricklinkPair(html: string): { category: string | null; subCategory: string | null } {
  const byDepth = new Map<number, string>();
  const re = /catString=([\d.]+)[^>]*>\s*([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const name = stripHtml(m[2]);
    if (!name || /^(catalog|sets?|minifigures?)$/i.test(name)) continue;
    const depth = m[1].split(".").filter(Boolean).length;
    if (!byDepth.has(depth)) byDepth.set(depth, name);
  }
  let category = byDepth.get(1) ?? null;
  let subCategory = byDepth.get(2) ?? null;

  if (!category || !subCategory) {
    const crumb = stripHtml(
      html.match(/Catalog[\s\S]{0,2000}?(Set Entry|Minifig Entry|Minifigure|Instructions Entry)/i)?.[0] ?? "",
    );
    const skip = /^(catalog|sets?|minifigures?|minifigs?|set entry|minifig entry|instructions entry)$/i;
    const parts = crumb
      .split(/[:›>]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !skip.test(s) && !/^\d/.test(s));
    category = category || parts[0] || null;
    subCategory = subCategory || parts[1] || null;
  }

  return { category, subCategory: usefulSubcategory(subCategory, category) };
}

