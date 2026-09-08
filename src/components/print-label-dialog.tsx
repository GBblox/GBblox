import { Download, Loader2, Printer } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { code128Svg } from "@/lib/barcode";
import { itemNumberDisplay, itemTypeLabel } from "@/lib/format";
import type { LabelBarcodeField, LabelLot } from "@/lib/label";
import { labelBarcodePayload } from "@/lib/label";
import {
  BAUD_RATES,
  CONNECTION_MODES,
  DPI_OPTIONS,
  LABEL_SIZES,
  PRINT_LANGUAGES,
  clampDarkness,
  isHostPrint,
  labelSizeOf,
  languageFileExt,
  type BaudRate,
  type ConnectionMode,
  type Dpi,
  type LabelSizeId,
  type PrintLanguage,
  usePrinter,
} from "@/lib/printer-settings";
import {
  downloadLabel,
  buildThermalLabel,
  effectiveConnection,
  pairedUsbName,
  printErrorMessage,
  printThermal,
  serialAvailable,
  usbAvailable,
} from "@/lib/thermal";
import { cn } from "@/lib/utils";

export function PrintLabelDialog({
  lot,
  open,
  onOpenChange,
}: {
  lot: LabelLot | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const printer = usePrinter();
  const [copies, setCopies] = useState("1");
  const [busy, setBusy] = useState<"send" | "system" | null>(null);
  const [barcodeField, setBarcodeField] = useState<LabelBarcodeField>("sku");
  const size = labelSizeOf(printer.sizeId);

  useEffect(() => {
    if (!open || !lot) return;
    setBarcodeField(lot.barcodeField === "location" && lot.location?.trim() ? "location" : "sku");
  }, [open, lot?.sku, lot?.location, lot?.barcodeField]);

  const printLot: LabelLot | null = lot ? { ...lot, barcodeField } : null;
  const payload = printLot ? labelBarcodePayload(printLot) : null;
  const barcode = useMemo(() => {
    const raw = barcodeField === "location" ? (lot?.location ?? "").trim() : (lot?.sku ?? "").trim();
    if (!raw) return "";
    try {
      return code128Svg(raw);
    } catch {
      return "";
    }
  }, [lot?.sku, lot?.location, barcodeField]);
  const canPrint = Boolean(barcode);

  const usbOk = usbAvailable();
  const serialOk = serialAvailable();
  const connection = effectiveConnection(printer.connection);
  const thermal = !isHostPrint(printer.language);
  const ext = languageFileExt(isHostPrint(printer.language) ? "zpl" : printer.language);

  const job = (n: number) => ({
    language: printer.language,
    sizeId: printer.sizeId,
    dpi: printer.dpi,
    darkness: clampDarkness(printer.darkness),
    copies: n,
    connection: printer.connection,
    baudRate: printer.baudRate,
  });

  const run = async (mode: "send" | "system") => {
    if (!printLot || !canPrint) {
      toast.error(
        barcodeField === "location"
          ? "Save a location before printing a location label."
          : "Save a SKU before printing a label.",
      );
      return;
    }
    const n = Math.max(1, Number(copies) || 1);
    setBusy(mode);
    try {
      if (mode === "system") {
        const result = await printThermal(printLot, { ...job(n), language: isHostPrint(printer.language) ? printer.language : "brother" });
        if (result === "printed") toast.success(`Sent ${n === 1 ? "a label" : `${n} labels`} to Brother print service`);
        return;
      }
      const result = await printThermal(printLot, job(n));
      if (result === "sent") {
        const name = (await pairedUsbName()) ?? printer.lastPrinterName.trim();
        if (name && name !== printer.lastPrinterName) printer.setPrinter({ lastPrinterName: name });
        toast.success(name ? `Sent to ${name}` : `Sent ${n === 1 ? "a label" : `${n} labels`} to the thermal printer`);
      } else if (result === "downloaded") {
        const viaUsb = printer.connection === "usb" || printer.connection === "serial";
        const file = payload?.caption ?? "label";
        toast.success(
          viaUsb ? `No printer connected — downloaded ${file}.${ext}` : `Downloaded ${file}.${ext}`,
        );
      } else {
        toast.success("Print dialog opened");
      }
    } catch (err) {
      toast.error(printErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const download = () => {
    if (!printLot || !canPrint) {
      toast.error(
        barcodeField === "location"
          ? "Save a location before printing a location label."
          : "Save a SKU before printing a label.",
      );
      return;
    }
    try {
      const n = Math.max(1, Number(copies) || 1);
      const language = isHostPrint(printer.language) ? "zpl" : printer.language;
      const built = buildThermalLabel(printLot, { ...job(n), language });
      downloadLabel(built);
      toast.success(`Downloaded ${built.filename}`);
    } catch (err) {
      toast.error(printErrorMessage(err));
    }
  };

  const previewScale = Math.min(1, 168 / (size.heightIn * 96));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,44rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-3">
          <DialogHeader>
            <DialogTitle>Print label</DialogTitle>
            <DialogDescription>
              {size.label} Code 128 of the SKU or location. Brother print service uses the QL-1110NWB driver. ZPL, TSPL, or EPL can be sent to other thermal printers.
            </DialogDescription>
          </DialogHeader>

          {lot && (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-md bg-surface-2 p-2">
                <div
                  className="mx-auto"
                  style={{ width: `${size.widthIn * previewScale}in`, height: `${size.heightIn * previewScale}in` }}
                >
                  <div
                    className="flex flex-col bg-surface text-fg shadow-[var(--shadow-border)]"
                    style={{
                      width: `${size.widthIn}in`,
                      height: `${size.heightIn}in`,
                      padding: "0.14in 0.18in 0.1in",
                      transform: `scale(${previewScale})`,
                      transformOrigin: "top left",
                    }}
                  >
                    <div
                      className={cn(
                        "flex text-xs font-bold tracking-wider text-muted uppercase",
                        barcodeField === "location" ? "justify-center" : "justify-between",
                      )}
                    >
                      <span>{payload?.tag ?? itemTypeLabel(lot.itemType)}</span>
                      {barcodeField === "location" ? null : (
                        <span className="font-mono">{itemNumberDisplay(lot.setNum, lot.itemType)}</span>
                      )}
                    </div>
                    {barcodeField === "location" ? null : (
                      <p className={cn("mt-1 font-extrabold leading-tight", size.heightIn < 2 ? "line-clamp-1 text-sm" : "line-clamp-2 text-lg")}>
                        {lot.name}
                      </p>
                    )}
                    <div
                      className="mt-1 min-h-0 flex-1 [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
                      dangerouslySetInnerHTML={{ __html: barcode }}
                    />
                    <p className="mt-1 text-center font-mono text-sm font-bold tracking-wide">{payload?.caption ?? lot.sku}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Barcode">
                  <Select
                    value={barcodeField}
                    onValueChange={(v) => setBarcodeField(v as LabelBarcodeField)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sku">SKU</SelectItem>
                      <SelectItem value="location" disabled={!lot.location?.trim()}>
                        Location{lot.location?.trim() ? ` · ${lot.location.trim()}` : " (add a location first)"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Language">
                  <Select
                    value={printer.language}
                    onValueChange={(v) => printer.setPrinter({ language: v as PrintLanguage })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRINT_LANGUAGES.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Label size">
                  <Select
                    value={printer.sizeId}
                    onValueChange={(v) => printer.setPrinter({ sizeId: v as LabelSizeId })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LABEL_SIZES.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {thermal && (
                  <>
                    <Field label="DPI">
                      <Select
                        value={String(printer.dpi)}
                        onValueChange={(v) => printer.setPrinter({ dpi: Number(v) as Dpi })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DPI_OPTIONS.map((d) => (
                            <SelectItem key={d} value={String(d)}>
                              {d} dpi
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Send via">
                      <Select
                        value={printer.connection}
                        onValueChange={(v) => printer.setPrinter({ connection: v as ConnectionMode })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONNECTION_MODES.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <div className="space-y-2">
                      <Label htmlFor="label-darkness">Darkness</Label>
                      <Input
                        id="label-darkness"
                        inputMode="numeric"
                        value={String(printer.darkness)}
                        onChange={(e) => printer.setPrinter({ darkness: clampDarkness(Number(e.target.value) || 0) })}
                      />
                    </div>
                    {printer.connection === "serial" && (
                      <Field label="Baud">
                        <Select
                          value={String(printer.baudRate)}
                          onValueChange={(v) => printer.setPrinter({ baudRate: Number(v) as BaudRate })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {BAUD_RATES.map((b) => (
                              <SelectItem key={b} value={String(b)}>
                                {b}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                  </>
                )}
                <div className="space-y-2">
                  <Label htmlFor="label-copies">Copies</Label>
                  <Input
                    id="label-copies"
                    inputMode="numeric"
                    value={copies}
                    onChange={(e) => setCopies(e.target.value)}
                  />
                </div>
              </div>

              {thermal && printer.connection === "usb" && !usbOk && (
                <p className="text-xs leading-relaxed text-muted">
                  USB needs Chrome or Edge on a secure page. This preview downloads a .{ext} file instead.
                </p>
              )}
              {thermal && printer.connection === "serial" && !serialOk && (
                <p className="text-xs leading-relaxed text-muted">
                  Serial access is not available here. The label will download as a .{ext} file.
                </p>
              )}
              {thermal && connection === "usb" && usbOk && printer.lastPrinterName && (
                <p className="text-xs text-muted">Last printer: {printer.lastPrinterName}</p>
              )}
            </div>
          )}
        </div>

        {lot && (
          <div className="flex shrink-0 flex-col gap-2 border-t border-border bg-surface px-5 py-3 sm:flex-row">
            {thermal ? (
              <Button className="flex-1" onClick={() => void run("send")} disabled={!canPrint || busy !== null}>
                {busy === "send" ? <Loader2 className="animate-spin" /> : <Printer />}
                {connection === "download" ? `Download .${ext}` : "Send to thermal"}
              </Button>
            ) : (
              <Button className="flex-1" onClick={() => void run("system")} disabled={!canPrint || busy !== null}>
                {busy === "system" ? <Loader2 className="animate-spin" /> : <Printer />}
                Print {size.label} label
              </Button>
            )}
            {thermal && (
              <Button variant="outline" onClick={() => void run("system")} disabled={!canPrint || busy !== null}>
                {busy === "system" ? <Loader2 className="animate-spin" /> : <Printer />}
                System print
              </Button>
            )}
            {thermal && connection !== "download" && (
              <Button variant="outline" onClick={download} disabled={!canPrint || busy !== null}>
                <Download />
                .{ext}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
