import type { Condition, Inclusion, ItemType, LegoSet, Status } from "./types";
import { detectItemType } from "./format";

export const CSV_COLUMNS = [
  "item_type",
  "sku",
  "location",
  "item_no",
  "name",
  "category",
  "sub_category",
  "year",
  "item_weight_g",
  "condition",
  "comes_with_instructions",
  "comes_with_box",
  "qty",
  "price",
  "currency",
  "status",
  "notes",
] as const;

export type CsvColumn = (typeof CSV_COLUMNS)[number];

export type CsvLotRow = {
  line: number;
  itemType: ItemType;
  sku: string;
  location: string;
  setNum: string;
  name: string;
  category: string | null;
  subCategory: string | null;
  year: number | null;
  weightGrams: number | null;
  condition: Condition;
  comesWithInstructions: Inclusion;
  comesWithBox: Inclusion;
  qty: number;
  askingPrice: number | null;
  currency: string;
  status: Status;
  notes: string;
};

export type CsvIssue = { line: number; message: string };

const HEADER_ALIASES: Record<string, CsvColumn> = {
  item_type: "item_type",
  type: "item_type",
  "item type": "item_type",
  sku: "sku",
  "custom label": "sku",
  location: "location",
  loc: "location",
  bin: "location",
  shelf: "location",
  "bin location": "location",
  item_no: "item_no",
  set_num: "item_no",
  setnum: "item_no",
  "set number": "item_no",
  "set no": "item_no",
  "item no": "item_no",
  "item no.": "item_no",
  "item number": "item_no",
  name: "name",
  "item name": "name",
  title: "name",
  category: "category",
  theme: "category",
  sub_category: "sub_category",
  subcategory: "sub_category",
  "sub category": "sub_category",
  subtheme: "sub_category",
  year: "year",
  "year released": "year",
  item_weight_g: "item_weight_g",
  "item weight": "item_weight_g",
  "item weight (g)": "item_weight_g",
  weight: "item_weight_g",
  weight_grams: "item_weight_g",
  condition: "condition",
  comes_with_instructions: "comes_with_instructions",
  instructions: "comes_with_instructions",
  inst: "comes_with_instructions",
  "comes with instructions": "comes_with_instructions",
  comes_with_box: "comes_with_box",
  box: "comes_with_box",
  "comes with box": "comes_with_box",
  qty: "qty",
  quantity: "qty",
  asking_price: "price",
  asking: "price",
  price: "price",
  currency: "currency",
  status: "status",
  notes: "notes",
  remarks: "notes",
};

const CONDITIONS: Record<string, Condition> = {
  used_complete: "used_complete",
  "used complete": "used_complete",
  "used · complete": "used_complete",
  used: "used_complete",
  u: "used_complete",
  complete: "used_complete",
  used_incomplete: "used_incomplete",
  "used incomplete": "used_incomplete",
  incomplete: "used_incomplete",
  used_parts: "used_parts",
  "used parts": "used_parts",
  parts: "used_parts",
  new_sealed: "new_sealed",
  "new sealed": "new_sealed",
  sealed: "new_sealed",
  n: "new_sealed",
  new: "new_sealed",
  new_opened: "new_opened",
  "new opened": "new_opened",
  opened: "new_opened",
};

const INCLUSIONS: Record<string, Inclusion> = {
  yes: "yes",
  y: "yes",
  true: "yes",
  no: "no",
  n: "no",
  false: "no",
  na: "na",
  n_a: "na",
  "n/a": "na",
  "not applicable": "na",
  "not_applicable": "na",
};

const STATUSES: Record<string, Status> = {
  complete: "complete",
  incomplete: "incomplete",
  for_sale: "for_sale",
  "for sale": "for_sale",
  sale: "for_sale",
  listed: "listed",
  reserved: "reserved",
  sold: "sold",
};

export const CSV_TEMPLATE = `${CSV_COLUMNS.join(",")}
set,,A-12,75192,Millennium Falcon,Star Wars,Ultimate Collector Series,2017,,used_complete,no,no,1,650,GBP,complete,UCS Falcon — box included
minifig,,BIN-03,sw0001,Battle Droid,Star Wars,Episode I,1999,,used_complete,na,na,1,8,GBP,incomplete,Leave SKU blank for GBB-MINIFIG-0001
`;

function downloadName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `gbblox-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.csv`;
}

export function csvTemplateFilename(): string {
  return "gbblox-template.csv";
}

export function csvExportFilename(): string {
  return downloadName();
}

export function parseCsvRecords(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += ch;
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export function lotsToCsv(lots: LegoSet[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const lot of lots) {
    const cells = [
      lot.itemType,
      lot.sku,
      lot.location,
      lot.setNum,
      lot.name,
      lot.category ?? "",
      lot.subCategory ?? "",
      lot.year == null ? "" : String(lot.year),
      lot.weightGrams == null ? "" : String(lot.weightGrams),
      lot.condition,
      lot.comesWithInstructions,
      lot.comesWithBox,
      String(lot.qty),
      lot.askingPrice == null ? "" : String(lot.askingPrice),
      lot.currency,
      lot.status,
      lot.notes,
    ];
    lines.push(cells.map(escapeCsv).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function blank(v: string | undefined): string {
  return (v ?? "").trim();
}

function numOrNull(v: string): number | null {
  const t = v.trim().replace(/[^0-9.-]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function mapHeader(raw: string): CsvColumn | null {
  const key = raw.trim().toLowerCase().replace(/[_]+/g, " ").replace(/\s+/g, " ");
  const compact = key.replace(/\s/g, "_");
  return HEADER_ALIASES[key] ?? HEADER_ALIASES[compact] ?? null;
}

export function parseInventoryCsv(text: string): { rows: CsvLotRow[]; issues: CsvIssue[] } {
  const table = parseCsvRecords(text);
  if (table.length < 2) throw new Error("CSV needs a header row and at least one lot.");
  const header = table[0].map(mapHeader);
  if (!header.includes("item_no")) {
    throw new Error("CSV must include an item_no (or Set Number / Item No) column.");
  }
  const rows: CsvLotRow[] = [];
  const issues: CsvIssue[] = [];
  const body = table.slice(1);
  if (body.length > 400) {
    throw new Error("CSV is limited to 400 lots per upload.");
  }
  body.forEach((cells, idx) => {
    const line = idx + 2;
    const get = (col: CsvColumn) => {
      const i = header.indexOf(col);
      return i >= 0 ? blank(cells[i]) : "";
    };
    const setNum = get("item_no");
    if (!setNum) {
      issues.push({ line, message: "Missing item number" });
      return;
    }
    const typeRaw = get("item_type").toLowerCase();
    const itemType: ItemType =
      typeRaw === "minifig" || typeRaw === "minifigure" || typeRaw === "fig"
        ? "minifig"
        : typeRaw === "set"
          ? "set"
          : detectItemType(setNum) === "minifig"
            ? "minifig"
            : "set";
    const conditionRaw = get("condition").toLowerCase();
    const condition = conditionRaw ? CONDITIONS[conditionRaw] : "used_complete";
    if (get("condition") && !condition) {
      issues.push({ line, message: `Unknown condition "${get("condition")}"` });
      return;
    }
    const parseInc = (col: "comes_with_instructions" | "comes_with_box", fallback: Inclusion): Inclusion => {
      const raw = get(col).toLowerCase();
      if (!raw) return fallback;
      const mapped = INCLUSIONS[raw];
      if (!mapped) {
        issues.push({ line, message: `Unknown ${col.replaceAll("_", " ")} "${get(col)}"` });
        return fallback;
      }
      return mapped;
    };
    const inclusionDefault: Inclusion = itemType === "minifig" ? "na" : "no";
    const comesWithInstructions = parseInc("comes_with_instructions", inclusionDefault);
    const comesWithBox = parseInc("comes_with_box", inclusionDefault);
    const statusRaw = get("status").toLowerCase();
    const status = statusRaw ? STATUSES[statusRaw] : "for_sale";
    if (get("status") && !status) {
      issues.push({ line, message: `Unknown status "${get("status")}"` });
      return;
    }
    const qtyRaw = numOrNull(get("qty"));
    const year = numOrNull(get("year"));
    const weight = numOrNull(get("item_weight_g"));
    const price = numOrNull(get("price"));
    rows.push({
      line,
      itemType,
      sku: get("sku"),
      location: get("location"),
      setNum,
      name: get("name"),
      category: get("category") || null,
      subCategory: get("sub_category") || null,
      year,
      weightGrams: weight,
      condition: condition ?? "used_complete",
      comesWithInstructions,
      comesWithBox,
      qty: qtyRaw && qtyRaw >= 1 ? Math.min(99, Math.round(qtyRaw)) : 1,
      askingPrice: price,
      currency: (get("currency") || "GBP").toUpperCase().slice(0, 8),
      status: status ?? "for_sale",
      notes: get("notes"),
    });
  });
  return { rows, issues };
}
