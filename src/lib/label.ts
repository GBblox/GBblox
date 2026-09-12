import { code128Svg } from "./barcode";
import { itemNumberDisplay, itemTypeLabel } from "./format";
import type { ItemType } from "./types";

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

export function labelPrintDocument(lot: LabelLot, copies = 1): string {
  const n = Math.min(99, Math.max(1, Math.floor(copies) || 1));
  const sheets = Array.from({ length: n }, () => labelMarkup(lot)).join("\n");
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>GBblox label</title>
<style>
  @page { size: auto; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111; width: 100%; height: 100%; }
  .label {
    width: 100%;
    height: 100%;
    min-height: 100vh;
    padding: 4%;
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
    font-size: 11pt;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #333;
  }
  .label.location .meta { justify-content: center; }
  .name {
    margin: 2% 0;
    font-size: 16pt;
    font-weight: 800;
    line-height: 1.15;
    overflow: hidden;
  }
  .barcode {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: stretch;
  }
  .barcode svg { width: 100%; height: 100%; display: block; }
  .sku {
    margin: 2% 0 0;
    text-align: center;
    font-family: "IBM Plex Mono", "Consolas", ui-monospace, monospace;
    font-size: 14pt;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
</style>
</head>
<body>
${sheets}
</body>
</html>`;
}

export function printLabelSheets(lot: LabelLot, copies = 1): void {
  const html = labelPrintDocument(lot, copies);
  const iframe = document.createElement("iframe");
  iframe.title = "Print label";
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:0;pointer-events:none";
  const cleanup = () => {
    iframe.onload = null;
    iframe.remove();
  };
  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      throw new Error("Could not open a print sheet.");
    }
    win.addEventListener("afterprint", cleanup);
    window.setTimeout(cleanup, 120_000);
    try {
      win.focus();
      win.print();
    } catch {
      const popup = window.open("", "_blank", "noopener,width=480,height=360");
      if (!popup) {
        cleanup();
        throw new Error("Could not open the print dialog. Allow pop-ups for this site.");
      }
      popup.document.open();
      popup.document.write(html);
      popup.document.close();
      popup.focus();
      popup.print();
      cleanup();
    }
  };
  document.body.appendChild(iframe);
  iframe.srcdoc = html;
}
