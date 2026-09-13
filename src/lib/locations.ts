export function normalizeLocation(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, 40);
}

export function isValidLocation(raw: string): boolean {
  const loc = normalizeLocation(raw);
  if (!loc) return true;
  for (const ch of loc) {
    const n = ch.charCodeAt(0);
    if (n < 32 || n > 126) return false;
  }
  return true;
}

export function parseLocations(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const loc = normalizeLocation(String(item ?? ""));
    if (!loc || !isValidLocation(loc)) continue;
    const key = loc.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(loc);
  }
  return out;
}

export function isMinifigLocation(raw: string): boolean {
  return normalizeLocation(raw).toUpperCase().startsWith("MF");
}

export function locationVisibleFor(raw: string, itemType?: "set" | "minifig"): boolean {
  const loc = normalizeLocation(raw);
  if (!loc) return false;
  const mf = isMinifigLocation(loc);
  if (itemType === "minifig") return mf;
  if (itemType === "set") return !mf;
  return true;
}

export function locationChoices(saved: string[], current = "", itemType?: "set" | "minifig"): string[] {
  const list = parseLocations(saved).filter((loc) => locationVisibleFor(loc, itemType));
  const cur = normalizeLocation(current);
  if (cur && locationVisibleFor(cur, itemType) && !list.some((l) => l.toLowerCase() === cur.toLowerCase())) {
    return [cur, ...list];
  }
  return list;
}

export function addLocationOption(
  saved: string[],
  raw: string,
): { list: string[]; added: string } | { error: string } {
  const loc = normalizeLocation(raw);
  if (!loc) return { error: "Enter a location code" };
  if (!isValidLocation(loc)) return { error: "Use printable ASCII only" };
  const list = parseLocations(saved);
  if (list.some((l) => l.toLowerCase() === loc.toLowerCase())) return { error: "Already in the list" };
  return { list: [...list, loc], added: loc };
}

export function removeLocationOption(saved: string[], raw: string): string[] {
  const key = normalizeLocation(raw).toLowerCase();
  return parseLocations(saved).filter((l) => l.toLowerCase() !== key);
}

export function moveLocationOption(saved: string[], from: number, to: number): string[] {
  const list = parseLocations(saved);
  if (!Number.isInteger(from) || !Number.isInteger(to)) return list;
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item == null) return list;
  next.splice(to, 0, item);
  return next;
}

export function mergeLocationOptions(saved: string[], extras: string[]): string[] {
  return parseLocations([...saved, ...extras]);
}
