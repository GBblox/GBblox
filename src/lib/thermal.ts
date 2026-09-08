import type { LabelLot } from "./label.ts";
import {
  clampDarkness,
  isHostPrint,
  labelSizeOf,
  languageFileExt,
  type BaudRate,
  type ConnectionMode,
  type Dpi,
  type LabelSizeId,
  type PrintLanguage,
} from "./printer-settings.ts";

export type ThermalJob = {
  language: PrintLanguage;
  sizeId: LabelSizeId;
  dpi: Dpi;
  darkness: number;
  copies: number;
  connection: ConnectionMode;
  baudRate: BaudRate;
};

export type ThermalPayload = {
  language: Exclude<PrintLanguage, "system" | "brother">;
  text: string;
  filename: string;
};

export const SAMPLE_LABEL: LabelLot = {
  sku: "GBB-SET-75192-0001",
  name: "Millennium Falcon",
  setNum: "75192-1",
  itemType: "set",
};

type Layout = {
  w: number;
  h: number;
  m: number;
  innerW: number;
  metaH: number;
  nameH: number;
  skuH: number;
  metaY: number;
  nameY: number;
  nameLines: number;
  barcodeY: number;
  barcodeH: number;
  skuY: number;
  secondaryY: number;
  module: number;
};

export function labelLayout(
  widthIn: number,
  heightIn: number,
  dpi: Dpi,
  sku: string,
  extraLine = false,
  locationOnly = false,
): Layout {
  const w = Math.round(widthIn * dpi);
  const h = Math.round(heightIn * dpi);
  const m = Math.round(0.12 * dpi);
  const innerW = Math.max(40, w - m * 2);
  const scale = heightIn / 2;
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  const metaH = Math.round(0.14 * dpi * clamp(scale, 0.65, 1.15));
  const nameH = locationOnly ? 0 : Math.round(0.22 * dpi * clamp(scale, 0.6, 1.35));
  const skuH = Math.round(0.16 * dpi * clamp(scale, 0.65, 1.15));
  const nameLines = locationOnly ? 0 : heightIn >= 3 ? 3 : heightIn >= 2 ? 2 : 1;
  const metaY = m;
  const nameY = metaY + metaH + Math.round(0.04 * dpi);
  const nameBlock = locationOnly ? Math.round(0.08 * dpi) : nameH * nameLines + Math.round(0.05 * dpi);
  const extraH = extraLine ? skuH : 0;
  const skuY = h - m - skuH - extraH;
  const secondaryY = h - m - extraH;
  const barcodeY = nameY + nameBlock;
  const barcodeH = Math.max(Math.round(0.32 * dpi), skuY - Math.round(0.06 * dpi) - barcodeY);
  const module = barcodeModuleWidth(sku, innerW);
  return {
    w,
    h,
    m,
    innerW,
    metaH,
    nameH,
    skuH,
    metaY,
    nameY,
    nameLines,
    barcodeY,
    barcodeH,
    skuY,
    secondaryY,
    module,
  };
}

export function barcodeModuleWidth(sku: string, availableDots: number): number {
  const payload = sku.trim() || "X";
  const modules = (payload.length + 4) * 11 + 2;
  return Math.max(1, Math.min(4, Math.floor(availableDots / (modules + 16))));
}

function zplFd(s: string): string {
  return s.replace(/[\^~]/g, " ").replace(/\r?\n/g, " ").trim();
}

function tsplStr(s: string): string {
  return s.replace(/"/g, "'").replace(/\r?\n/g, " ");
}

function eplStr(s: string): string {
  return [...s]
    .map((c) => {
      const n = c.charCodeAt(0);
      if (n < 32 || n > 126) return "?";
      if (c === '"') return "'";
      return c;
    })
    .join("");
}

export function wrapWords(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length || maxLines < 1 || maxChars < 1) return [];
  const lines: string[] = [];
  let cur = "";
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const next = cur ? `${cur} ${word}` : word;
    if (next.length <= maxChars) {
      cur = next;
      continue;
    }
    if (cur) lines.push(cur);
    if (lines.length >= maxLines - 1) {
      const rest = [word, ...words.slice(i + 1)].join(" ");
      lines.push(rest.length > maxChars ? `${rest.slice(0, Math.max(1, maxChars - 1))}…` : rest);
      return lines.slice(0, maxLines);
    }
    cur = word.length > maxChars ? `${word.slice(0, maxChars)}` : word;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

function copiesOf(n: number): number {
  return Math.min(99, Math.max(1, Math.floor(Number(n) || 1)));
}

function fileSafe(sku: string): string {
  return sku.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 60) || "label";
}

function fields(lot: LabelLot) {
  const sku = lot.sku.trim() || "NO-SKU";
  const loc = (lot.location ?? "").trim();
  const name = lot.name.trim() || lot.setNum;
  const num = lot.itemType === "minifig" ? lot.setNum : lot.setNum.replace(/-1$/, "");
  const kind = lot.itemType === "minifig" ? "MINIFIGURE" : "SET";
  const locationMode = lot.barcodeField === "location";
  const code = locationMode ? loc || "NO-LOC" : sku;
  const tag = locationMode ? "LOCATION" : kind;
  const caption = code;
  const secondary = "";
  return { sku, loc, name, num, kind, code, tag, caption, secondary, locationMode };
}

export function generateZpl(lot: LabelLot, job: Pick<ThermalJob, "sizeId" | "dpi" | "darkness" | "copies">): string {
  const size = labelSizeOf(job.sizeId);
  const { code, tag, caption, secondary, name, num, locationMode } = fields(lot);
  const L = labelLayout(size.widthIn, size.heightIn, job.dpi, code, Boolean(secondary), locationMode);
  const dark = clampDarkness(job.darkness);
  const n = copiesOf(job.copies);
  const fb = (x: number, y: number, font: number, lines: number, align: "L" | "C" | "R", text: string) =>
    `^FO${x},${y}^A0N,${font},${font}^FB${L.innerW},${lines},8,${align}^FD${zplFd(text)}^FS`;
  const lines = [
    "^XA",
    "^CI28",
    `^PW${L.w}`,
    `^LL${L.h}`,
    "^LH0,0",
    "^LS0",
    `^MD${dark}`,
    "^PR4",
  ];
  if (locationMode) {
    lines.push(fb(L.m, L.metaY, L.metaH, 1, "C", tag));
  } else {
    lines.push(
      fb(L.m, L.metaY, L.metaH, 1, "L", tag),
      fb(L.m, L.metaY, L.metaH, 1, "R", num),
      fb(L.m, L.nameY, L.nameH, L.nameLines, "L", name),
    );
  }
  lines.push(`^FO${L.m},${L.barcodeY}^BY${L.module},2,${L.barcodeH}^BCN,${L.barcodeH},N,N,N^FD${zplFd(code)}^FS`);
  lines.push(fb(L.m, L.skuY, L.skuH, 1, "C", caption));
  if (secondary) lines.push(fb(L.m, L.secondaryY, Math.max(18, Math.round(L.skuH * 0.75)), 1, "C", secondary));
  lines.push(`^PQ${n}`, "^XZ", "");
  return lines.join("\n");
}

export function generateTspl(lot: LabelLot, job: Pick<ThermalJob, "sizeId" | "dpi" | "darkness" | "copies">): string {
  const size = labelSizeOf(job.sizeId);
  const { code, tag, caption, secondary, name, num, locationMode } = fields(lot);
  const L = labelLayout(size.widthIn, size.heightIn, job.dpi, code, Boolean(secondary), locationMode);
  const density = Math.min(15, Math.max(0, Math.round(clampDarkness(job.darkness) / 2)));
  const n = copiesOf(job.copies);
  const nameChars = Math.max(8, Math.floor(L.innerW / Math.max(12, Math.round(L.nameH * 0.55 || 12))));
  const nameLines = locationMode ? [] : wrapWords(name, nameChars, L.nameLines);
  const fontFor = (h: number) => {
    if (h >= 40) return { font: "5", mul: Math.max(1, Math.round(h / 48)) };
    if (h >= 24) return { font: "4", mul: Math.max(1, Math.round(h / 32)) };
    return { font: "3", mul: 1 };
  };
  const meta = fontFor(L.metaH);
  const title = fontFor(L.nameH || 24);
  const skuFont = fontFor(L.skuH);
  const lines = [
    `SIZE ${size.widthIn},${size.heightIn}`,
    "GAP 0.12,0",
    `DENSITY ${density}`,
    "DIRECTION 1",
    "REFERENCE 0,0",
    "CODEPAGE UTF-8",
    "CLS",
    `TEXT ${L.m},${L.metaY},"${meta.font}",0,${meta.mul},${meta.mul},"${tsplStr(tag)}"`,
  ];
  if (!locationMode) {
    lines.push(
      `TEXT ${L.m + Math.max(0, L.innerW - num.length * 12 * meta.mul)},${L.metaY},"${meta.font}",0,${meta.mul},${meta.mul},"${tsplStr(num)}"`,
    );
    nameLines.forEach((line, i) => {
      lines.push(
        `TEXT ${L.m},${L.nameY + i * (L.nameH + 4)},"${title.font}",0,${title.mul},${title.mul},"${tsplStr(line)}"`,
      );
    });
  }
  lines.push(
    `BARCODE ${L.m},${L.barcodeY},"128",${L.barcodeH},0,0,${L.module},${Math.max(L.module + 1, L.module * 2)},"${tsplStr(code)}"`,
    `TEXT ${L.m},${L.skuY},"${skuFont.font}",0,${skuFont.mul},${skuFont.mul},"${tsplStr(caption)}"`,
  );
  if (secondary) {
    const sec = fontFor(Math.max(18, Math.round(L.skuH * 0.75)));
    lines.push(
      `TEXT ${L.m},${L.secondaryY},"${sec.font}",0,${sec.mul},${sec.mul},"${tsplStr(secondary)}"`,
    );
  }
  lines.push(`PRINT ${n},1`, "");
  return lines.join("\n");
}

export function generateEpl(lot: LabelLot, job: Pick<ThermalJob, "sizeId" | "dpi" | "darkness" | "copies">): string {
  const size = labelSizeOf(job.sizeId);
  const { code, tag, caption, secondary, name, num, locationMode } = fields(lot);
  const L = labelLayout(size.widthIn, size.heightIn, job.dpi, code, Boolean(secondary), locationMode);
  const n = copiesOf(job.copies);
  const nameChars = Math.max(8, Math.floor(L.innerW / 14));
  const nameLines = locationMode ? [] : wrapWords(name, nameChars, L.nameLines);
  const font = L.nameH >= 40 ? 5 : 4;
  const metaFont = 3;
  const lines = [
    "",
    "N",
    `q${L.w}`,
    `Q${L.h},24`,
    `A${L.m},${L.metaY},0,${metaFont},1,1,N,"${eplStr(tag)}"`,
  ];
  if (!locationMode) {
    lines.push(`A${L.m + Math.max(0, L.innerW - num.length * 12)},${L.metaY},0,${metaFont},1,1,N,"${eplStr(num)}"`);
    nameLines.forEach((line, i) => {
      lines.push(`A${L.m},${L.nameY + i * (L.nameH + 4)},0,${font},1,1,N,"${eplStr(line)}"`);
    });
  }
  lines.push(
    `B${L.m},${L.barcodeY},0,1,${L.module},${Math.max(2, L.module + 2)},${L.barcodeH},N,"${eplStr(code)}"`,
    `A${L.m},${L.skuY},0,${metaFont},1,1,N,"${eplStr(caption)}"`,
  );
  if (secondary) {
    lines.push(`A${L.m},${L.secondaryY},0,${metaFont},1,1,N,"${eplStr(secondary)}"`);
  }
  lines.push(`P${n}`, "");
  return lines.join("\n");
}

export function buildThermalLabel(lot: LabelLot, job: ThermalJob): ThermalPayload {
  const language = isHostPrint(job.language) ? "zpl" : job.language;
  const { code } = fields(lot);
  const text =
    language === "tspl" ? generateTspl(lot, job) : language === "epl" ? generateEpl(lot, job) : generateZpl(lot, job);
  return {
    language,
    text,
    filename: `${fileSafe(code)}.${languageFileExt(language)}`,
  };
}

export function usbAvailable(): boolean {
  return typeof navigator !== "undefined" && Boolean(getUsb()) && Boolean(window.isSecureContext);
}

export function serialAvailable(): boolean {
  return typeof navigator !== "undefined" && Boolean(getSerial()) && Boolean(window.isSecureContext);
}

export function effectiveConnection(connection: ConnectionMode): ConnectionMode {
  if (connection === "usb" && !usbAvailable()) return "download";
  if (connection === "serial" && !serialAvailable()) return "download";
  return connection;
}

export function downloadLabel(payload: ThermalPayload): void {
  const blob = new Blob([payload.text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = payload.filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export async function pairUsbPrinter(): Promise<string> {
  const usb = requireUsb();
  const device = await usb.requestDevice({ filters: [] });
  cachedUsb = device;
  const name = deviceName(device);
  return name;
}

export async function pairSerialPort(): Promise<string> {
  const serial = requireSerial();
  const port = await serial.requestPort();
  cachedSerial = port;
  return "Serial printer";
}

export async function pairedUsbName(): Promise<string | null> {
  const usb = getUsb();
  if (!usb) return cachedUsb ? deviceName(cachedUsb) : null;
  const devices = await usb.getDevices();
  if (cachedUsb) return deviceName(cachedUsb);
  if (devices[0]) {
    cachedUsb = devices[0];
    return deviceName(devices[0]);
  }
  return null;
}

export async function printThermal(lot: LabelLot, job: ThermalJob): Promise<"printed" | "sent" | "downloaded"> {
  const { code } = fields(lot);
  if (lot.barcodeField === "location" && !(lot.location ?? "").trim()) {
    throw new Error("Save a location before printing a location label.");
  }
  if (lot.barcodeField !== "location" && !lot.sku.trim()) {
    throw new Error("Save a SKU before printing a label.");
  }
  if (!code.trim()) throw new Error("Nothing to barcode.");
  const copies = copiesOf(job.copies);
  if (isHostPrint(job.language)) {
    const { printLabelSheets } = await import("./label.ts");
    const size = labelSizeOf(job.sizeId);
    printLabelSheets(lot, copies, { widthIn: size.widthIn, heightIn: size.heightIn });
    return "printed";
  }
  const payload = buildThermalLabel(lot, { ...job, copies });
  const connection = effectiveConnection(job.connection);
  if (connection === "download") {
    downloadLabel(payload);
    return "downloaded";
  }
  const bytes = new TextEncoder().encode(payload.text);
  try {
    if (connection === "serial") await sendSerial(bytes, job.baudRate);
    else await sendUsb(bytes);
    return "sent";
  } catch (err) {
    if (!shouldDownloadFallback(err)) throw err;
    downloadLabel(payload);
    return "downloaded";
  }
}

export function printErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : "Could not print";
  const name = err instanceof Error ? err.name : "";
  if (name === "NotFoundError" || /cancel/i.test(raw)) return "Print cancelled.";
  if (name === "SecurityError" || name === "NotAllowedError") {
    return "This page cannot open USB printers. Download the label file and send it with your printer's utility, or use system print.";
  }
  if (/not supported|usb is not/i.test(raw)) {
    return "This browser cannot talk to USB printers. Download the label file instead.";
  }
  return raw;
}

function shouldDownloadFallback(err: unknown): boolean {
  const name = err instanceof Error ? err.name : "";
  const raw = err instanceof Error ? err.message : "";
  if (name === "NotFoundError" || name === "SecurityError" || name === "NotAllowedError") return true;
  if (/cancel|not supported|usb is not|cannot talk|cannot open|could not claim/i.test(raw)) return true;
  return false;
}

type UsbEndpoint = { type: string; direction: string; endpointNumber: number };
type UsbAlternate = { endpoints: UsbEndpoint[] };
type UsbInterface = { claimed: boolean; interfaceNumber: number; alternate: UsbAlternate };
type UsbConfiguration = { interfaces: UsbInterface[] };
type UsbDevice = {
  opened: boolean;
  productName?: string;
  manufacturerName?: string;
  configuration: UsbConfiguration | null;
  open: () => Promise<void>;
  close: () => Promise<void>;
  selectConfiguration: (n: number) => Promise<void>;
  claimInterface: (n: number) => Promise<void>;
  transferOut: (endpoint: number, data: Uint8Array) => Promise<{ status: string; bytesWritten: number }>;
};
type NavigatorUsb = {
  getDevices: () => Promise<UsbDevice[]>;
  requestDevice: (opts: { filters: Array<{ vendorId?: number; classCode?: number }> }) => Promise<UsbDevice>;
};

type SerialPortLike = {
  readable: unknown;
  writable: { getWriter: () => { write: (data: Uint8Array) => Promise<void>; releaseLock: () => void } } | null;
  open: (opts: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
};
type NavigatorSerial = {
  getPorts: () => Promise<SerialPortLike[]>;
  requestPort: () => Promise<SerialPortLike>;
};

let cachedUsb: UsbDevice | null = null;
let cachedSerial: SerialPortLike | null = null;

function getUsb(): NavigatorUsb | null {
  if (typeof navigator === "undefined") return null;
  return ((navigator as Navigator & { usb?: NavigatorUsb }).usb ?? null) as NavigatorUsb | null;
}

function getSerial(): NavigatorSerial | null {
  if (typeof navigator === "undefined") return null;
  return ((navigator as Navigator & { serial?: NavigatorSerial }).serial ?? null) as NavigatorSerial | null;
}

function requireUsb(): NavigatorUsb {
  const usb = getUsb();
  if (!usb) throw new Error("This browser cannot talk to USB printers. Download the label file instead.");
  if (typeof window !== "undefined" && !window.isSecureContext) {
    throw new Error("USB printers need a secure page. Download the label file instead.");
  }
  return usb;
}

function requireSerial(): NavigatorSerial {
  const serial = getSerial();
  if (!serial) throw new Error("This browser cannot talk to serial printers. Download the label file instead.");
  return serial;
}

function deviceName(device: UsbDevice): string {
  const man = device.manufacturerName?.trim();
  const prod = device.productName?.trim();
  if (man && prod) return `${man} ${prod}`;
  return prod || man || "USB printer";
}

async function sendUsb(bytes: Uint8Array): Promise<void> {
  const usb = requireUsb();
  let device = cachedUsb;
  if (!device) {
    const granted = await usb.getDevices();
    device = granted[0] ?? null;
  }
  if (!device) {
    device = await usb.requestDevice({
      filters: [
        { classCode: 7 },
        { vendorId: 0x0a5f },
        { vendorId: 0x0dd4 },
        { vendorId: 0x0483 },
        { vendorId: 0x1a86 },
        { vendorId: 0x0403 },
        { vendorId: 0x067b },
        { vendorId: 0x0fe6 },
        { vendorId: 0x0416 },
        { vendorId: 0x1fc9 },
      ],
    });
  }
  cachedUsb = device;
  if (!device.opened) await device.open();
  if (!device.configuration) await device.selectConfiguration(1);
  const target = await claimBulkOut(device);
  const CHUNK = 16_384;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(bytes.length, i + CHUNK));
    const res = await device.transferOut(target.endpointNumber, slice);
    if (res.status !== "ok") {
      cachedUsb = null;
      throw new Error("The printer stalled while sending the label.");
    }
  }
}

async function claimBulkOut(device: UsbDevice): Promise<{ interfaceNumber: number; endpointNumber: number }> {
  const ifaces = device.configuration?.interfaces ?? [];
  let lastErr: unknown;
  for (const iface of ifaces) {
    const ep = iface.alternate.endpoints.find((e) => e.type === "bulk" && e.direction === "out");
    if (!ep) continue;
    try {
      if (!iface.claimed) await device.claimInterface(iface.interfaceNumber);
      return { interfaceNumber: iface.interfaceNumber, endpointNumber: ep.endpointNumber };
    } catch (err) {
      lastErr = err;
    }
  }
  const hint =
    lastErr instanceof Error
      ? ` ${lastErr.message}`
      : "";
  throw new Error(
    `Could not claim the USB printer.${hint} Close the printer's own app and try again, or download the label file.`,
  );
}

async function sendSerial(bytes: Uint8Array, baudRate: BaudRate): Promise<void> {
  const serial = requireSerial();
  let port = cachedSerial;
  if (!port) {
    const ports = await serial.getPorts();
    port = ports[0] ?? null;
  }
  if (!port) port = await serial.requestPort();
  cachedSerial = port;
  try {
    await port.open({ baudRate });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (!/already open/i.test(msg)) throw err;
  }
  if (!port.writable) throw new Error("The serial port is not writable.");
  const writer = port.writable.getWriter();
  try {
    await writer.write(bytes);
  } finally {
    writer.releaseLock();
  }
}
