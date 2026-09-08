import { code128Svg } from "./barcode";
import { itemNumberDisplay, itemTypeLabel } from "./format";
import type { ItemType } from "./types";

export const LABEL_WIDTH_IN = 62 / 25.4;
export const LABEL_HEIGHT_IN = 50 / 25.4;

export type LabelBarcodeField = "sku" | "location";

export type LabelLot = {
  sku: string;
  name: string;
  setNum: string;
  itemType: ItemType;
  location?: string;
  barcodeField?: LabelBarcodeField;
};

export function labelBarcodePayload(lot: LabelLot): {
  code: string;
  caption: string;
  tag: string;
  secondary: string;
} {
  const sku = lot.sku.trim() || "NO-SKU";
  const loc = (lot.location ?? "").trim();
  const kind = itemTypeLabel(lot.itemType).toUpperCase();
  if (lot.barcodeField === "location") {
    return {
      code: loc || "NO-LOC",
      caption: loc || "NO LOCATION",
      tag: "LOCATION",
      secondary: "",
    };
  }
  return { code: sku, caption: sku, tag: kind, secondary: "" };
}

export type LabelPageSize = {
  widthMm: number;
  heightMm: number;
};

export const LABEL_PAGE_62_CONT: LabelPageSize = { widthMm: 62, heightMm: 50 };

function trimMm(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "\u0026amp;")
    .replaceAll("<", "\u0026lt;")
    .replaceAll(">", "\u0026gt;")
    .replaceAll('"', "\u0026quot;");
}

export function labelMarkup(lot: LabelLot): string {
  const payload = labelBarcodePayload(lot);
  let barcode = "";
  try {
    barcode = code128Svg(payload.code);
  } catch {
    barcode = "";
  }
  if (lot.barcodeField === "location") {
    return `<article class="label location">
  <header class="meta"><span>${escapeHtml(payload.tag)}</span></header>
  <div class="barcode">${barcode}</div>
  <p class="sku">${escapeHtml(payload.caption)}</p>
</article>`;
  }
  const name = lot.name.trim() || lot.setNum;
  const num = itemNumberDisplay(lot.setNum, lot.itemType);
  return `<article class="label">
  <header class="meta"><span>${escapeHtml(payload.tag)}</span><span>${escapeHtml(num)}</span></header>
  <p class="name">${escapeHtml(name)}</p>
  <div class="barcode">${barcode}</div>
  <p class="sku">${escapeHtml(payload.caption)}</p>
</article>`;
}

export function labelPrintDocument(
  lot: LabelLot,
  copies = 1,
  size: LabelPageSize = LABEL_PAGE_62_CONT,
): string {
  const n = Math.min(99, Math.max(1, Math.floor(copies) || 1));
  const sheets = Array.from({ length: n }, () => labelMarkup(lot)).join("\n");
  const wMm = Math.round(size.widthMm * 10) / 10;
  const hMm = Math.round(size.heightMm * 10) / 10;
  const namePt = hMm >= 150 ? 22 : hMm >= 75 ? 18 : hMm >= 50 ? 16 : 12;
  const skuPt = hMm >= 50 ? 11 : 9;
  const metaPt = hMm >= 50 ? 9 : 8;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>GBblox ${trimMm(wMm)}mm x ${trimMm(hMm)}mm</title>
<style>
  @page { size: ${trimMm(wMm)}mm ${trimMm(hMm)}mm; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111; width: ${trimMm(wMm)}mm; height: ${trimMm(hMm)}mm; }
  .label {
    width: ${trimMm(wMm)}mm;
    height: ${trimMm(hMm)}mm;
    padding: 2mm 3mm 1.5mm;
    display: flex;
    flex-direction: column;
    page-break-after: always;
    overflow: hidden;
    font-family: Arial, Helvetica, sans-serif;
  }
  .label:last-child { page-break-after: auto; }
  .meta {
    display: flex;
    justify-content: space-between;
    font-size: ${metaPt}pt;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #333;
  }
  .label.location .meta { justify-content: center; }
  .name {
    margin: 1.5mm 0 1mm;
    font-size: ${namePt}pt;
    font-weight: 800;
    line-height: 1.15;
    max-height: ${hMm >= 75 ? "20mm" : hMm >= 50 ? "12mm" : "7mm"};
    overflow: hidden;
  }
  .barcode {
    flex: 1;
    min-height: ${hMm >= 50 ? "18mm" : "8mm"};
    display: flex;
    align-items: stretch;
  }
  .barcode svg { width: 100%; height: 100%; display: block; }
  .sku {
    margin: 0.06in 0 0;
    text-align: center;
    font-family: "IBM Plex Mono", "Consolas", ui-monospace, monospace;
    font-size: ${skuPt}pt;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .secondary {
    margin: 0.02in 0 0;
    text-align: center;
    font-family: "IBM Plex Mono", "Consolas", ui-monospace, monospace;
    font-size: ${Math.max(7, skuPt - 2)}pt;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: #333;
  }
</style>
</head>
<body>
${sheets}
</body>
</html>`;
}

export function printLabelSheets(
  lot: LabelLot,
  copies = 1,
  size: LabelPageSize = LABEL_PAGE_62_CONT,
): void {
  const html = labelPrintDocument(lot, copies, size);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    throw new Error("Could not open a print sheet.");
  }
  doc.open();
  doc.write(html);
  doc.close();
  const win = iframe.contentWindow;
  const cleanup = () => iframe.remove();
  win?.addEventListener("afterprint", cleanup);
  window.setTimeout(cleanup, 60_000);
  win?.focus();
  win?.print();
}
