import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Store } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChannelMark } from "@/components/channel-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney, itemNumberDisplay, itemTypeLabel } from "@/lib/format";
import { listOnBricklink, listOnEbay } from "@/lib/server/sets";
import { bricklinkCanSync, credentialsOf, ebayCanPublish, useSettings } from "@/lib/settings";
import { type LegoSet } from "@/lib/types";

function listable(lot: LegoSet) {
  if (lot.status === "sold") return false;
  if (lot.status === "incomplete") return false;
  if (lot.condition === "used_incomplete" || lot.condition === "used_parts") return false;
  return lot.itemType === "set" || lot.itemType === "minifig";
}

export function ListingsPanel({
  lots,
  onOpen,
}: {
  lots: LegoSet[];
  onOpen: (lot: LegoSet) => void;
}) {
  const settings = useSettings();
  const qc = useQueryClient();
  const [channel, setChannel] = useState<"ebay" | "bricklink">("ebay");
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const rows = useMemo(() => {
    return lots.filter((lot) => {
      if (!listable(lot)) return false;
      if (channel === "ebay" && lot.ebayListed) return false;
      if (channel === "bricklink" && lot.blListed) return false;
      return true;
    });
  }, [lots, channel]);

  const ebayCount = useMemo(
    () => lots.filter((lot) => listable(lot) && !lot.ebayListed).length,
    [lots],
  );
  const blCount = useMemo(
    () => lots.filter((lot) => listable(lot) && !lot.blListed).length,
    [lots],
  );

  const selectedLots = rows.filter((lot) => picked.has(lot.id));
  const allOn = rows.length > 0 && rows.every((lot) => picked.has(lot.id));

  function toggle(id: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allOn) setPicked(new Set());
    else setPicked(new Set(rows.map((lot) => lot.id)));
  }

  function toggleEbay() {
    if (channel === "ebay") return;
    setChannel("ebay");
    setPicked(new Set());
  }

  function toggleBricklink() {
    if (channel === "bricklink") return;
    setChannel("bricklink");
    setPicked(new Set());
  }

  const bulk = useMutation({
    mutationFn: async (channel: "ebay" | "bricklink") => {
      const creds = credentialsOf(settings);
      const results: { ok: number; fail: number } = { ok: 0, fail: 0 };
      for (const lot of selectedLots) {
        try {
          if (channel === "ebay") {
            if (lot.ebayListed) continue;
            await listOnEbay({ data: { id: lot.id, settings: creds } });
          } else {
            if (lot.blListed) continue;
            await listOnBricklink({ data: { id: lot.id, settings: creds } });
          }
          results.ok += 1;
        } catch (err) {
          results.fail += 1;
          toast.error(
            `${itemNumberDisplay(lot.setNum, lot.itemType)}: ${err instanceof Error ? err.message : "Failed"}`,
          );
        }
      }
      return results;
    },
    onSuccess: (res, channel) => {
      qc.invalidateQueries({ queryKey: ["sets"] });
      setPicked(new Set());
      const name = channel === "ebay" ? "eBay" : "BrickLink";
      if (res.ok) toast.success(`Listed ${res.ok} on ${name}${res.fail ? ` · ${res.fail} failed` : ""}`);
      else if (res.fail) toast.error(`Nothing listed on ${name}`);
    },
  });

  return (
    <section className="space-y-4">
      <div>
        <h1 className="font-display text-[26px] leading-[1.15] font-extrabold tracking-tight text-navy">Listings</h1>
        <p className="mt-2 text-[16px] leading-snug text-fg">
          Complete sets and minifigures · {rows.length} shown
        </p>
      </div>

      <div className="flex w-full overflow-hidden rounded-md shadow-[var(--shadow-border)]">
        <Button
          type="button"
          size="sm"
          variant={channel === "ebay" ? "secondary" : "ghost"}
          className="min-w-0 flex-1 rounded-none px-2.5 shadow-none"
          aria-pressed={channel === "ebay"}
          onClick={toggleEbay}
        >
          Not listed on eBay ({ebayCount})
        </Button>
        <Button
          type="button"
          size="sm"
          variant={channel === "bricklink" ? "secondary" : "ghost"}
          className="min-w-0 flex-1 rounded-none px-2.5 shadow-none"
          aria-pressed={channel === "bricklink"}
          onClick={toggleBricklink}
        >
          Not listed on BrickLink ({blCount})
        </Button>
      </div>
      {channel === "ebay" ? (
        <Button
          type="button"
          size="sm"
          className="w-full"
          disabled={!selectedLots.length || bulk.isPending || !ebayCanPublish(settings)}
          onClick={() => bulk.mutate("ebay")}
        >
          {bulk.isPending && bulk.variables === "ebay" ? <Loader2 className="animate-spin" /> : <Store />}
          List {selectedLots.length || ""} on eBay
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="w-full"
          disabled={!selectedLots.length || bulk.isPending || !bricklinkCanSync(settings)}
          onClick={() => bulk.mutate("bricklink")}
        >
          {bulk.isPending && bulk.variables === "bricklink" ? <Loader2 className="animate-spin" /> : <Store />}
          List {selectedLots.length || ""} on BrickLink
        </Button>
      )}

      <ul className="overflow-hidden rounded-md bg-surface shadow-[var(--shadow-border)]">
        <li className="flex items-center gap-3 border-b border-border bg-surface-2 px-4 py-2 text-xs text-muted">
          <input type="checkbox" checked={allOn} onChange={toggleAll} aria-label="Select all" />
          <span>{selectedLots.length} selected</span>
        </li>
        {rows.map((lot) => (
          <li key={lot.id} className="border-b border-border last:border-b-0">
            <div className="flex items-center gap-3 px-4 py-3">
              <input
                type="checkbox"
                checked={picked.has(lot.id)}
                onChange={() => toggle(lot.id)}
                aria-label={`Select ${lot.name}`}
              />
              <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onOpen(lot)}>
                <span className="size-12 shrink-0 overflow-hidden rounded-sm bg-white">
                  {lot.imageUrl ? <img src={lot.imageUrl} alt="" className="size-full object-contain" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{lot.name}</span>
                  <span className="mt-0.5 block font-mono text-[11px] text-subtle">
                    {itemNumberDisplay(lot.setNum, lot.itemType)} · {lot.sku}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="default">{itemTypeLabel(lot.itemType)}</Badge>
                    {lot.ebayListed ? <ChannelMark channel="ebay" height={12} /> : null}
                    {lot.blListed ? <ChannelMark channel="bricklink" height={12} /> : null}
                  </span>
                </span>
                <span className="shrink-0 font-display text-base font-extrabold tabular-nums">
                  {formatMoney(lot.askingPrice ?? lot.usedPrice, lot.currency)}
                </span>
              </button>
            </div>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="px-4 py-8 text-center text-sm text-muted">No matching lots.</li>
        ) : null}
      </ul>
    </section>
  );
}
