import { code128Svg } from "./barcode";
import { itemNumberDisplay, itemTypeLabel } from "./format";
import type { ItemType } from "./types";

export const LABEL_WIDTH_IN = 4;
export const LABEL_HEIGHT_IN = 2;

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
  widthIn: number;
  heightIn: number;
};

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
  size: LabelPageSize = { widthIn: LABEL_WIDTH_IN, heightIn: LABEL_HEIGHT_IN },
): string {
  const n = Math.min(99, Math.max(1, Math.floor(copies) || 1));
  const sheets = Array.from({ length: n }, () => labelMarkup(lot)).join("\n");
  const w = size.widthIn;
  const h = size.heightIn;
  const namePt = h >= 6 ? 22 : h >= 3 ? 18 : h >= 2 ? 16 : 12;
  const skuPt = h >= 2 ? 11 : 9;
  const metaPt = h >= 2 ? 9 : 8;
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>Label ${escapeHtml(labelBarcodePayload(lot).caption)}</title>
<style>
  @page { size: ${w}in ${h}in; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111; }
  .label {
    width: ${w}in;
    height: ${h}in;
    padding: 0.14in 0.18in 0.1in;
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
    margin: 0.08in 0 0.06in;
    font-size: ${namePt}pt;
    font-weight: 800;
    line-height: 1.15;
    max-height: ${h >= 3 ? "0.8in" : h >= 2 ? "0.48in" : "0.28in"};
    overflow: hidden;
  }
  .barcode {
    flex: 1;
    min-height: ${h >= 2 ? "0.7in" : "0.32in"};
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
  size: LabelPageSize = { widthIn: LABEL_WIDTH_IN, heightIn: LABEL_HEIGHT_IN },
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
