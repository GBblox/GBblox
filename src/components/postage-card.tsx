import { useMutation } from "@tanstack/react-query";
import { Loader2, Printer, Stamp, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RM_PACKAGES, RM_SERVICES, serviceLabel } from "@/lib/royal-mail";
import { createPostage, reprintPostage } from "@/lib/server/postage";
import { credentialsOf, royalMailCanPost, useSettings } from "@/lib/settings";
import type { SaleOrderDetail } from "@/lib/types";

function openPdf(base64: string, mode: "print" | "download") {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  if (mode === "download") {
    const a = document.createElement("a");
    a.href = url;
    a.download = "royal-mail-label.pdf";
    a.click();
    return;
  }
  const w = window.open(url, "_blank");
  if (w) {
    const t = window.setTimeout(() => w.print(), 700);
    w.addEventListener("load", () => {
      window.clearTimeout(t);
      w.print();
    });
  }
}

export function PostageCard({
  detail,
  onUpdated,
}: {
  detail: SaleOrderDetail;
  onUpdated: (row: SaleOrderDetail) => void;
}) {
  const settings = useSettings();
  const canPost = royalMailCanPost(settings);
  const [service, setService] = useState("TPN48");
  const [pack, setPack] = useState("smallParcel");
  const [weight, setWeight] = useState("500");
  const [confirm, setConfirm] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      createPostage({
        data: {
          ...credentialsOf(settings),
          channel: detail.channel,
          id: detail.id,
          serviceCode: service,
          packageFormat: pack,
          weightGrams: Math.max(1, Number(weight) || 500),
        },
      }),
    onSuccess: (row) => {
      onUpdated(row);
      setConfirm(false);
      toast.success(row.postage?.trackingNumber ? `Tracking ${row.postage.trackingNumber}` : "Postage label created");
      if (row.postage?.labelPdf) openPdf(row.postage.labelPdf, "print");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Royal Mail failed"),
  });

  const reprint = useMutation({
    mutationFn: () =>
      reprintPostage({
        data: {
          ...credentialsOf(settings),
          channel: detail.channel,
          id: detail.id,
        },
      }),
    onSuccess: (row) => {
      onUpdated(row);
      toast.success("Label ready");
      if (row.postage?.labelPdf) openPdf(row.postage.labelPdf, "print");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Reprint failed"),
  });

  const addrOk = Boolean(detail.address?.line1 && detail.address?.postal);
  const postage = detail.postage;

  return (
    <section className="rounded-md bg-surface-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">Royal Mail Click & Drop</p>
        {postage ? <Badge variant="sale">Label paid</Badge> : null}
      </div>

      {!canPost ? (
        <p className="mt-2 text-sm text-muted">Add your Click & Drop authorisation key in Settings.</p>
      ) : !addrOk ? (
        <p className="mt-2 flex items-start gap-2 text-sm text-warn">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          This order has no ship-to address yet. Pull details again after the buyer pays.
        </p>
      ) : postage ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm">
            {serviceLabel(postage.serviceCode)}
            {postage.trackingNumber ? (
              <>
                {" · "}
                <span className="font-mono font-semibold">{postage.trackingNumber}</span>
              </>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!postage.labelPdf || reprint.isPending}
              onClick={() => postage.labelPdf && openPdf(postage.labelPdf, "print")}
            >
              <Printer />
              Print label
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!postage.labelPdf}
              onClick={() => postage.labelPdf && openPdf(postage.labelPdf, "download")}
            >
              Download PDF
            </Button>
            <Button variant="outline" size="sm" disabled={reprint.isPending} onClick={() => reprint.mutate()}>
              {reprint.isPending ? <Loader2 className="animate-spin" /> : <Stamp />}
              Reprint
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Service</Label>
              <Select value={service} onValueChange={setService}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RM_SERVICES.map((s) => (
                    <SelectItem key={s.code} value={s.code}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Package</Label>
              <Select value={pack} onValueChange={setPack}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RM_PACKAGES.map((s) => (
                    <SelectItem key={s.code} value={s.code}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rm-weight">Weight (g)</Label>
              <Input
                id="rm-weight"
                inputMode="numeric"
                value={weight}
                onChange={(e) => setWeight(e.target.value.replace(/[^\d]/g, ""))}
              />
            </div>
          </div>
          {confirm ? (
            <div className="space-y-2 rounded-md bg-surface p-3 text-sm shadow-[var(--shadow-border)]">
              <p>
                This charges your Royal Mail Click & Drop account and prints a{" "}
                <span className="font-semibold">{serviceLabel(service)}</span> label.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={create.isPending} onClick={() => create.mutate()}>
                  {create.isPending ? <Loader2 className="animate-spin" /> : <Stamp />}
                  Pay & print
                </Button>
                <Button variant="outline" size="sm" disabled={create.isPending} onClick={() => setConfirm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" onClick={() => setConfirm(true)}>
              <Stamp />
              Pay & print label
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
