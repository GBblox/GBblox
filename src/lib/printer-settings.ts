import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

const mm = (n: number) => n / 25.4;

function size<I extends string>(
  id: I,
  widthMm: number,
  heightMm: number,
  tapeWidthMm: number,
  continuous: boolean,
  label: string,
) {
  return {
    id,
    widthMm,
    heightMm,
    tapeWidthMm,
    continuous,
    label,
    widthIn: mm(widthMm),
    heightIn: mm(heightMm),
  } as const;
}

/** Thermal command-file sizes. System print ignores these and uses the OS dialog. */
export const LABEL_SIZES = [
  size("dk-22205", 62, 50, 62, true, "62 mm continuous · 50 mm cut"),
  size("dk-22205-80", 62, 80, 62, true, "62 mm continuous · 80 mm cut"),
  size("dk-62x29", 62, 29, 62, false, "62 × 29 mm die-cut"),
  size("dk-62x42", 62, 42, 62, false, "62 × 42 mm die-cut"),
  size("dk-11202", 62, 100, 62, false, "DK-11202 · 62 × 100 mm die-cut"),
  size("dk-11209", 29, 62, 29, false, "DK-11209 · 29 × 62 mm"),
  size("dk-11201", 29, 90.3, 29, false, "DK-11201 · 29 × 90 mm"),
  size("dk-11208", 38, 90.3, 38, false, "DK-11208 · 38 × 90 mm"),
  size("dk-2214", 103, 50, 103, true, "DK-2214 · 103 mm continuous (50 mm cut)"),
  size("dk-1241", 102, 152, 103, false, "DK-1241 · 102 × 152 mm"),
  size("dk-11241", 103, 164, 103, false, "DK-11241 · 103 × 164 mm die-cut"),
] as const;

export type LabelSizeId = (typeof LABEL_SIZES)[number]["id"];
export type LabelSize = (typeof LABEL_SIZES)[number];

export const LABEL_SIZE_GROUPS: { heading: string; ids: readonly LabelSizeId[] }[] = [
  { heading: "62 mm tape", ids: ["dk-22205", "dk-22205-80", "dk-62x29", "dk-62x42", "dk-11202"] },
  { heading: "29 / 38 mm tape", ids: ["dk-11209", "dk-11201", "dk-11208"] },
  { heading: "103 mm tape", ids: ["dk-2214", "dk-1241", "dk-11241"] },
];

export const PRINT_LANGUAGES = [
  { id: "system", label: "System print", hint: "Browser print dialog · paper size is chosen there" },
  { id: "zpl", label: "ZPL", hint: "Zebra, Rollo, many 4″ desktops" },
  { id: "tspl", label: "TSPL", hint: "TSC, Munbyn, some Rollo clones" },
  { id: "epl", label: "EPL", hint: "Older Eltron / Zebra" },
  { id: "escp", label: "ESC/P", hint: "Command file download" },
] as const;

export type PrintLanguage = (typeof PRINT_LANGUAGES)[number]["id"];

export const DPI_OPTIONS = [203, 300] as const;
export type Dpi = (typeof DPI_OPTIONS)[number];

export const CONNECTION_MODES = [
  { id: "usb", label: "USB printer" },
  { id: "serial", label: "Serial / USB adapter" },
  { id: "download", label: "Download command file" },
] as const;

export type ConnectionMode = (typeof CONNECTION_MODES)[number]["id"];

export const BAUD_RATES = [9600, 19200, 38400, 57600, 115200] as const;
export type BaudRate = (typeof BAUD_RATES)[number];

export type PrinterSettings = {
  language: PrintLanguage;
  sizeId: LabelSizeId;
  dpi: Dpi;
  darkness: number;
  connection: ConnectionMode;
  baudRate: BaudRate;
  lastPrinterName: string;
};

export const DEFAULT_PRINTER: PrinterSettings = {
  language: "system",
  sizeId: "dk-22205",
  dpi: 300,
  darkness: 15,
  connection: "usb",
  baudRate: 9600,
  lastPrinterName: "",
};

const LEGACY_SIZE: Record<string, LabelSizeId> = {
  "4x1": "dk-62x29",
  "4x2": "dk-22205",
  "4x3": "dk-11202",
  "4x6": "dk-22205",
};

export function sizeIdForPrinter(id: LabelSizeId | string, language: PrintLanguage | string): LabelSizeId {
  const size = labelSizeOf(id);
  if (language === "zpl" || language === "tspl" || language === "epl") return size.id;
  if (size.tapeWidthMm === 62) return size.id;
  return DEFAULT_PRINTER.sizeId;
}

export function sizeMatchesInstalledTape(id: LabelSizeId | string): boolean {
  return true;
}

type PrinterState = PrinterSettings & {
  setPrinter: (patch: Partial<PrinterSettings>) => void;
};

export const usePrinterStore = create<PrinterState>()(
  persist(
    (set) => ({
      ...DEFAULT_PRINTER,
      setPrinter: (patch) => set(patch),
    }),
    {
      name: "brickshelf-printer",
      skipHydration: true,
      version: 8,
      migrate: () => ({ ...DEFAULT_PRINTER }),
      partialize: (s) => ({
        language: s.language,
        sizeId: s.sizeId,
        dpi: s.dpi,
        darkness: s.darkness,
        connection: s.connection,
        baudRate: s.baudRate,
        lastPrinterName: s.lastPrinterName,
      }),
    },
  ),
);

let rehydrated = false;
export function rehydratePrinterSettings(): void {
  if (rehydrated || typeof window === "undefined") return;
  rehydrated = true;
  void usePrinterStore.persist.rehydrate();
}

export function usePrinter(): PrinterSettings & { setPrinter: PrinterState["setPrinter"] } {
  return usePrinterStore(
    useShallow((s) => ({
      language: s.language,
      sizeId: s.sizeId,
      dpi: s.dpi,
      darkness: s.darkness,
      connection: s.connection,
      baudRate: s.baudRate,
      lastPrinterName: s.lastPrinterName,
      setPrinter: s.setPrinter,
    })),
  );
}

export function labelSizeOf(id: LabelSizeId | string = DEFAULT_PRINTER.sizeId): LabelSize {
  const mapped = LEGACY_SIZE[id] ?? id;
  return LABEL_SIZES.find((s) => s.id === mapped) ?? LABEL_SIZES[0];
}

export function isHostPrint(id: PrintLanguage | string): boolean {
  return id === "system";
}

export function languageLabel(id: PrintLanguage): string {
  return PRINT_LANGUAGES.find((l) => l.id === id)?.label ?? id;
}

export function languageFileExt(id: PrintLanguage): "zpl" | "tspl" | "epl" | "prn" | "txt" {
  if (id === "zpl" || id === "tspl" || id === "epl") return id;
  if (id === "escp") return "prn";
  return "txt";
}

export function clampDarkness(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_PRINTER.darkness;
  return Math.min(30, Math.max(0, Math.round(n)));
}

export function cssPageSize(size: Pick<LabelSize, "widthMm" | "heightMm">): string {
  return `${trimMm(size.widthMm)}mm ${trimMm(size.heightMm)}mm`;
}

function trimMm(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
