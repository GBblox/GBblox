/** Code 128-B patterns: six bar/space widths (modules sum to 11). Stop is seven (13). */
const PATTERNS: string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];

const START_B = 104;
const STOP = 106;

function valueOf(ch: string): number {
  const v = ch.charCodeAt(0) - 32;
  if (v < 0 || v > 94) {
    throw new Error(`SKU character "${ch}" cannot be encoded as a barcode.`);
  }
  return v;
}

export function code128Values(text: string): number[] {
  const body = [...text].map(valueOf);
  const codes = [START_B, ...body];
  let sum = START_B;
  for (let i = 0; i < body.length; i += 1) sum += body[i] * (i + 1);
  codes.push(sum % 103);
  codes.push(STOP);
  return codes;
}

export function code128Widths(text: string): number[] {
  return code128Values(text).flatMap((code) => [...PATTERNS[code]].map(Number));
}

export function drawCode128Stretched(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const payload = text.trim();
  if (!payload || width <= 0 || height <= 0) return;
  const widths = code128Widths(payload);
  const inner = widths.reduce((a, b) => a + b, 0);
  const quiet = 10;
  const total = inner + quiet * 2;
  const unit = width / total;
  ctx.fillStyle = "#111111";
  let px = x + quiet * unit;
  widths.forEach((w, i) => {
    const bw = w * unit;
    if (i % 2 === 0) ctx.fillRect(px, y, Math.max(1, bw), height);
    px += bw;
  });
}

export function code128DataUrl(text: string, barHeight = 160, barWidth?: number): string {
  const payload = text.trim();
  if (!payload || typeof document === "undefined") return "";
  const quiet = 10;
  const widths = code128Widths(payload);
  const inner = widths.reduce((a, b) => a + b, 0);
  const scale = 8;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, barWidth ?? (inner + quiet * 2) * scale);
  canvas.height = barHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawCode128Stretched(ctx, payload, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export function code128Svg(text: string): string {
  const payload = text.trim();
  if (!payload) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40" role="img" aria-label="Missing SKU"></svg>`;
  }
  const quiet = 10;
  const widths = code128Widths(payload);
  const inner = widths.reduce((a, b) => a + b, 0);
  const total = inner + quiet * 2;
  const h = 40;
  let x = quiet;
  const bars: string[] = [];
  widths.forEach((w, i) => {
    if (i % 2 === 0) {
      bars.push(`<rect x="${x}" y="0" width="${w}" height="${h}" fill="#111"/>`);
    }
    x += w;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${h}" preserveAspectRatio="none" role="img" aria-label="Barcode ${escapeXml(payload)}">${bars.join("")}</svg>`;
}

function escapeXml(s: string): string {
  return s.replaceAll("&", "\u0026amp;").replaceAll("<", "\u0026lt;").replaceAll('"', "\u0026quot;");
}
