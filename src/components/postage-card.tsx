import { useMutation } from "@tanstack/react-query";
import { ExternalLink, Loader2, RefreshCw, Stamp, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CLICK_AND_DROP_APP, RM_PACKAGES, RM_SERVICES, serviceLabel } from "@/lib/royal-mail";
import { createPostage, reprintPostage } from "@/lib/server/postage";
import { credentialsOf, royalMailCanPost, useSettings } from "@/lib/settings";
import type { SaleOrderDetail } from "@/lib/types";

export function PostageCard({
  detail,
  onUpdated,
}: {
  detail: SaleOrderDetail;
  onUpdated: (row: SaleOrderDetail) => void;
}) {
  const settings = useSettings();
  const canPost = royalMailCanPost(settings);
  const [service, setService] = useState("TOLP24");
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
      toast.success(
        row.postage?.trackingNumber
          ? `Click & Drop #${row.postage.orderIdentifier} · ${row.postage.trackingNumber}`
          : `Click & Drop #${row.postage?.orderIdentifier} — look under New orders`,
      );
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Royal Mail failed"),
  });

  const refresh = useMutation({
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
      toast.success(row.postage?.trackingNumber ? `Tracking ${row.postage.trackingNumber}` : "No tracking yet");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not refresh Click & Drop"),
  });

  const addrOk = Boolean(detail.address?.line1 && detail.address?.postal);
  const postage = detail.postage;

  return (
    <section className="rounded-md bg-surface-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">Royal Mail Click & Drop</p>
        {postage ? <Badge variant="sale">In Click & Drop</Badge> : null}
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
            ) : (
              <span className="text-muted"> · look under New orders, not printed labels</span>
            )}
          </p>
          <p className="font-mono text-xs text-subtle">
            Click & Drop #{postage.orderIdentifier} · search {`BS-${detail.channel}-${detail.id}`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" asChild>
              <a href={CLICK_AND_DROP_APP} target="_blank" rel="noreferrer">
                <ExternalLink />
                Open Click & Drop
              </a>
            </Button>
            <Button variant="outline" size="sm" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
              {refresh.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Refresh tracking
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted">
            Pay-as-you-go account — GBblox sends the order; you print the label in Click & Drop.
          </p>
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
                Send this order to Click & Drop as{" "}
                <span className="font-semibold">{serviceLabel(service)}</span>. Postage is paid when you print
                in the Click & Drop app.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={create.isPending} onClick={() => create.mutate()}>
                  {create.isPending ? <Loader2 className="animate-spin" /> : <Stamp />}
                  Send to Click & Drop
                </Button>
                <Button variant="outline" size="sm" disabled={create.isPending} onClick={() => setConfirm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" onClick={() => setConfirm(true)}>
              <Stamp />
              Send to Click & Drop
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
