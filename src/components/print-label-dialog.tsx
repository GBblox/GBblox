import { Loader2, Printer } from "lucide-react";
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
import { labelBarcodePayload, printLabelSheets } from "@/lib/label";
import { printErrorMessage } from "@/lib/thermal";
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
  const [copies, setCopies] = useState("1");
  const [busy, setBusy] = useState(false);
  const [barcodeField, setBarcodeField] = useState<LabelBarcodeField>("sku");

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

  const run = () => {
    if (!printLot || !canPrint) {
      toast.error(
        barcodeField === "location"
          ? "Save a location before printing a location label."
          : "Save a SKU before printing a label.",
      );
      return;
    }
    const n = Math.max(1, Number(copies) || 1);
    setBusy(true);
    try {
      printLabelSheets(printLot, n);
      toast.success("Print dialog opened");
      onOpenChange(false);
    } catch (err) {
      toast.error(printErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="z-[80]"
        className="z-[80] flex max-h-[min(92vh,44rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0"
        onPointerDownOutside={(e) => e.stopPropagation()}
        onInteractOutside={(e) => e.stopPropagation()}
        onFocusOutside={(e) => e.stopPropagation()}
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-3">
          <DialogHeader>
            <DialogTitle>Print label</DialogTitle>
            <DialogDescription>Paper size and printer are chosen in the system print dialog.</DialogDescription>
          </DialogHeader>

          {lot && (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-md bg-surface-2 p-3">
                <div className="mx-auto flex min-h-40 w-full max-w-sm flex-col bg-surface p-3 text-fg shadow-[var(--shadow-border)]">
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
                    <p className="mt-1 line-clamp-2 text-lg font-extrabold leading-tight">{lot.name}</p>
                  )}
                  <div
                    className="mt-1 min-h-0 w-full flex-1 [&_svg]:block [&_svg]:h-full [&_svg]:w-full [&_svg]:max-w-none"
                    dangerouslySetInnerHTML={{ __html: barcode }}
                  />
                  <p className="mt-1 text-center font-mono text-lg font-bold tracking-wide">{payload?.caption ?? lot.sku}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Barcode">
                  <Select value={barcodeField} onValueChange={(v) => setBarcodeField(v as LabelBarcodeField)}>
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
            </div>
          )}
        </div>

        {lot && (
          <div className="flex shrink-0 border-t border-border bg-surface px-5 py-3">
            <Button className="w-full" onClick={run} disabled={!canPrint || busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Printer />}
              Print
            </Button>
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
