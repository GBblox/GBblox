import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

const mm = (n: number) => n / 25.4;

export const LABEL_SIZES = [
  { id: "dk-62x29", widthIn: mm(62), heightIn: mm(29), label: "62 × 29 mm" },
  { id: "dk-62x42", widthIn: mm(62), heightIn: mm(42), label: "62 × 42 mm" },
  { id: "dk-11209", widthIn: mm(29), heightIn: mm(62), label: "DK-11209 · 29 × 62 mm" },
  { id: "dk-11201", widthIn: mm(29), heightIn: mm(90.3), label: "DK-11201 · 29 × 90 mm" },
  { id: "dk-11208", widthIn: mm(38), heightIn: mm(90.3), label: "DK-11208 · 38 × 90 mm" },
  { id: "dk-11202", widthIn: mm(62), heightIn: mm(100), label: "DK-11202 · 62 × 100 mm" },
  { id: "dk-22205", widthIn: mm(62), heightIn: mm(50), label: "DK-22205 · 62 mm continuous (50 mm)" },
  { id: "dk-2214", widthIn: mm(103), heightIn: mm(50), label: "DK-2214 · 103 mm continuous (50 mm)" },
  { id: "dk-1241", widthIn: mm(102), heightIn: mm(152), label: "DK-1241 · 102 × 152 mm (4×6)" },
] as const;

export type LabelSizeId = (typeof LABEL_SIZES)[number]["id"];

export const PRINT_LANGUAGES = [
  { id: "brother", label: "Brother print service", hint: "QL-1110NWB · Brother driver / Print Service" },
  { id: "system", label: "System print", hint: "Browser print dialog" },
  { id: "zpl", label: "ZPL", hint: "Zebra, Rollo, many 4″ desktops" },
  { id: "tspl", label: "TSPL", hint: "TSC, Munbyn, some Rollo clones" },
  { id: "epl", label: "EPL", hint: "Older Eltron / Zebra" },
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
  language: "brother",
  sizeId: "dk-62x29",
  dpi: 300,
  darkness: 15,
  connection: "usb",
  baudRate: 9600,
  lastPrinterName: "Brother QL-1110NWB",
};

const LEGACY_SIZE: Record<string, LabelSizeId> = {
  "4x1": "dk-62x29",
  "4x2": "dk-62x29",
  "4x3": "dk-62x29",
  "4x6": "dk-1241",
};

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
      version: 4,
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<PrinterSettings> & { sizeId?: string };
        return {
          ...DEFAULT_PRINTER,
          ...p,
          sizeId: DEFAULT_PRINTER.sizeId,
          language: p.language && PRINT_LANGUAGES.some((l) => l.id === p.language) ? p.language : DEFAULT_PRINTER.language,
          dpi: 300,
          lastPrinterName: p.lastPrinterName?.trim() || DEFAULT_PRINTER.lastPrinterName,
        };
      },
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

export function labelSizeOf(id: LabelSizeId | string = "dk-62x29"): (typeof LABEL_SIZES)[number] {
  const mapped = LEGACY_SIZE[id] ?? id;
  return LABEL_SIZES.find((s) => s.id === mapped) ?? LABEL_SIZES[0];
}

export function isHostPrint(id: PrintLanguage | string): boolean {
  return id === "brother" || id === "system";
}

export function languageLabel(id: PrintLanguage): string {
  return PRINT_LANGUAGES.find((l) => l.id === id)?.label ?? id;
}

export function languageFileExt(id: PrintLanguage): "zpl" | "tspl" | "epl" | "txt" {
  if (id === "zpl" || id === "tspl" || id === "epl") return id;
  return "txt";
}

export function clampDarkness(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_PRINTER.darkness;
  return Math.min(30, Math.max(0, Math.round(n)));
}
