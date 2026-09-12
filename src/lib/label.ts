import { code128Svg, drawCode128Stretched } from "./barcode";
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

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines - 1) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1] ?? "";
    while (last && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    if (words.join(" ").length > last.length) lines[maxLines - 1] = `${last.trim()}…`;
  }
  return lines;
}

export function renderLabelPng(lot: LabelLot, width = 1464, height = 686): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#111111";
  ctx.textBaseline = "top";

  const payload = labelBarcodePayload(lot);
  const padX = Math.round(width * 0.035);
  const padY = Math.round(height * 0.07);
  const innerW = width - padX * 2;
  const metaH = Math.round(height * 0.11);
  const skuH = Math.round(height * 0.18);
  const nameH = lot.barcodeField === "location" ? 0 : Math.round(height * 0.2);
  const gap = Math.round(height * 0.035);

  ctx.font = `700 ${metaH}px Arial, Helvetica, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText(payload.tag, padX, padY, innerW * 0.55);
  if (lot.barcodeField !== "location") {
    const num = itemNumberDisplay(lot.setNum, lot.itemType);
    ctx.textAlign = "right";
    ctx.fillText(num, width - padX, padY, innerW * 0.4);
  }

  let y = padY + metaH + gap;
  if (nameH) {
    const name = lot.name.trim() || lot.setNum;
    const fontPx = Math.round(height * 0.125);
    ctx.font = `800 ${fontPx}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = "left";
    const lines = wrapLines(ctx, name, innerW, 2);
    lines.forEach((line, i) => ctx.fillText(line, padX, y + i * fontPx * 1.12, innerW));
    y += Math.round(fontPx * 1.12 * Math.max(1, lines.length)) + gap;
  }

  const skuY = height - padY - skuH;
  const barcodeY = y;
  const barcodeH = Math.max(24, skuY - gap - barcodeY);
  drawCode128Stretched(ctx, payload.code, padX, barcodeY, innerW, barcodeH);

  ctx.font = `700 ${skuH}px "IBM Plex Mono", Consolas, ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(payload.caption, width / 2, skuY + skuH / 2, innerW);

  return canvas.toDataURL("image/png");
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "\u0026amp;")
    .replaceAll("<", "\u0026lt;")
    .replaceAll(">", "\u0026gt;")
    .replaceAll('"', "\u0026quot;");
}

export function labelMarkup(lot: LabelLot): string {
  const png = renderLabelPng(lot);
  if (png) return `<div class="page"><img class="sheet" alt="" src="${png}" /></div>`;
  const payload = labelBarcodePayload(lot);
  let barcode = "";
  try {
    barcode = code128Svg(payload.code);
  } catch {
    barcode = "";
  }
  const name = lot.name.trim() || lot.setNum;
  const num = itemNumberDisplay(lot.setNum, lot.itemType);
  if (lot.barcodeField === "location") {
    return `<article class="label location">
  <header class="meta"><span>${escapeHtml(payload.tag)}</span></header>
  <div class="barcode">${barcode}</div>
  <p class="sku">${escapeHtml(payload.caption)}</p>
</article>`;
  }
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
  @page { margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; width: 100%; height: 100%; }
  .page {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    break-after: page;
    page-break-after: always;
  }
  .page:last-child { break-after: auto; page-break-after: auto; }
  img.sheet {
    display: block;
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
    object-position: center center;
  }
  .label {
    width: 100%;
    height: 100%;
    padding: 1.5mm 2mm;
    display: flex;
    flex-direction: column;
    gap: 0.8mm;
    font-family: Arial, Helvetica, sans-serif;
  }
  .meta, .name, .sku { flex: 0 0 auto; }
  .meta { display: flex; justify-content: space-between; font-size: 9pt; font-weight: 700; text-transform: uppercase; }
  .name { margin: 0; font-size: 12pt; font-weight: 800; }
  .barcode { flex: 1 1 0; min-height: 8mm; }
  .barcode svg { width: 100%; height: 100%; display: block; }
  .sku { margin: 0; text-align: center; font-size: 14pt; font-weight: 700; font-family: Consolas, monospace; }
</style>
</head>
<body>
${sheets}
</body>
</html>`;
}

function whenPrintable(doc: Document): Promise<void> {
  const images = Array.from(doc.images);
  return Promise.all([
    doc.fonts?.ready ?? Promise.resolve(),
    ...images.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }),
    ),
  ]).then(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

export function printLabelSheets(lot: LabelLot, copies = 1): void {
  const html = labelPrintDocument(lot, copies);
  const iframe = document.createElement("iframe");
  iframe.title = "Print label";
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:744px;height:348px;border:0;";
  const cleanup = () => {
    iframe.remove();
  };
  document.body.appendChild(iframe);
  const win = iframe.contentWindow;
  const doc = iframe.contentDocument;
  if (!win || !doc) {
    iframe.remove();
    throw new Error("Could not open a print sheet.");
  }
  doc.open();
  doc.write(html);
  doc.close();
  win.addEventListener("afterprint", cleanup);
  window.setTimeout(cleanup, 120_000);
  void whenPrintable(doc).then(() => {
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
  });
}