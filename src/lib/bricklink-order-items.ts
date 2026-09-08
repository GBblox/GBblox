import type { SaleLine } from "./types";

function decodeEntities(raw: unknown): string {
  const s = raw == null ? "" : String(raw);
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replaceAll("\u0026amp;", "&")
    .replaceAll("\u0026lt;", "<")
    .replaceAll("\u0026gt;", ">")
    .replaceAll("\u0026quot;", '"')
    .replaceAll("\u0026apos;", "'")
    .replaceAll("\u0026nbsp;", " ");
}

export type BlOrderItem = {
  inventory_id?: number | string;
  item?: { no?: string; name?: string; type?: string };
  color_id?: number;
  color_name?: string;
  quantity?: number;
  new_or_used?: string;
  remarks?: string;
  description?: string;
  unit_price?: string | number;
  unit_price_final?: string | number;
  disp_unit_price?: string | number;
};

function moneyNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function textOf(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v).trim();
  if (Array.isArray(v)) return v.map(textOf).filter(Boolean).join(" ");
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return textOf(o.full || o.name || [o.first, o.last].filter(Boolean).join(" ") || o.value || o.text);
  }
  return "";
}

/** BrickLink returns order items as an array of batches (array of arrays). */
export function flattenOrderItems(data: unknown): BlOrderItem[] {
  if (data == null) return [];
  const rows = Array.isArray(data) ? data : [data];
  const out: BlOrderItem[] = [];
  for (const row of rows) {
    if (Array.isArray(row)) out.push(...(row as BlOrderItem[]));
    else if (row && typeof row === "object") out.push(row as BlOrderItem);
  }
  return out;
}

function itemKindLabel(type: string): string {
  const t = type.toUpperCase();
  if (t === "MINIFIG") return "Minifigure";
  if (t === "SET") return "Set";
  if (t === "PART") return "Part";
  if (t === "GEAR") return "Gear";
  if (t === "BOOK") return "Book";
  if (t === "INSTRUCTION") return "Instructions";
  return type || "";
}

function catalogThumb(type: string, no: string, colorId: number): string | null {
  if (!no) return null;
  const t = type.toUpperCase();
  const file = encodeURIComponent(no);
  if (t === "MINIFIG") return `https://img.bricklink.com/ItemImage/MN/0/${file}.png`;
  if (t === "SET") return `https://img.bricklink.com/ItemImage/SN/0/${file}.png`;
  if (t === "PART") return `https://img.bricklink.com/ItemImage/PN/${colorId || 0}/${file}.png`;
  return `https://img.bricklink.com/ItemImage/GN/0/${file}.png`;
}

export function mapBlItems(lines: BlOrderItem[]): SaleLine[] {
  return lines.map((line) => {
    const no = textOf(line.item?.no);
    const name = decodeEntities(textOf(line.item?.name));
    const kindRaw = textOf(line.item?.type);
    const colorRaw = textOf(line.color_name);
    const color = colorRaw && !/not applicable/i.test(colorRaw) ? colorRaw : "";
    const title =
      [name, color].filter(Boolean).join(" · ") ||
      no ||
      decodeEntities(textOf(line.description) || textOf(line.remarks)) ||
      (line.inventory_id != null ? `Lot ${line.inventory_id}` : "BrickLink item");
    const used = String(line.new_or_used || "").toUpperCase() === "U";
    const neu = String(line.new_or_used || "").toUpperCase() === "N";
    return {
      title,
      sku: textOf(line.remarks) || null,
      itemNo: no || null,
      qty: Number(line.quantity) || 1,
      price: moneyNum(line.disp_unit_price) ?? moneyNum(line.unit_price_final) ?? moneyNum(line.unit_price),
      itemKind: kindRaw ? itemKindLabel(kindRaw) : null,
      condition: used ? "Used" : neu ? "New" : null,
      color: color || null,
      imageUrl: catalogThumb(kindRaw, no, Number(line.color_id) || 0),
    };
  });
}
