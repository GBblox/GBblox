import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Loader2, Store } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChannelMark } from "@/components/channel-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { composeBricklinkListing } from "@/lib/bricklink-listing";
import { composeListing, ebayPremiumAmount, listingDescriptionPlain, pickStoreMapping, type EbayStoreCategory } from "@/lib/ebay";
import { formatMoney, itemNumberDisplay, itemTypeLabel } from "@/lib/format";
import { getEbayStoreCategories, listOnBricklink, listOnEbay } from "@/lib/server/sets";
import { useMarketplaceApis } from "@/lib/marketplace-apis";
import { credentialsOf, useSettings } from "@/lib/settings";
import { type LegoSet } from "@/lib/types";

const STORE_NONE = "__none__";

function listable(lot: LegoSet) {
  if (lot.status === "sold") return false;
  if (lot.status === "incomplete") return false;
  if (lot.condition === "used_incomplete" || lot.condition === "used_parts") return false;
  return lot.itemType === "set" || lot.itemType === "minifig";
}

type EbayRow = {
  title: string;
  price: string;
  quantity: string;
  categoryId: string;
  description: string;
  storeCategoryId: string;
  storeCategory2Id: string;
};

type BlRow = {
  description: string;
  price: string;
};

function ebayRowOf(lot: LegoSet, cats: EbayStoreCategory[] = [], premium = 0): EbayRow {
  const draft = composeListing(lot, "EBAY_GB", premium);
  const mapped = cats.length ? pickStoreMapping(cats, lot) : { category: null, subCategory: null };
  return {
    title: draft.title,
    price: draft.price != null ? String(draft.price) : "",
    quantity: String(draft.quantity),
    categoryId: draft.categoryId,
    description: listingDescriptionPlain(draft.descriptionHtml),
    storeCategoryId: mapped.category?.id ?? "",
    storeCategory2Id: mapped.subCategory?.id ?? "",
  };
}

function blRowOf(lot: LegoSet): BlRow {
  const draft = composeBricklinkListing(lot);
  return {
    description: draft.description,
    price: draft.unitPrice != null ? String(draft.unitPrice) : "",
  };
}

export function ListingsPanel({
  lots,
  onOpen,
}: {
  lots: LegoSet[];
  onOpen: (lot: LegoSet) => void;
}) {
  const settings = useSettings();
  const apis = useMarketplaceApis();
  const qc = useQueryClient();
  const [channel, setChannel] = useState<"ebay" | "bricklink">("ebay");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [confirm, setConfirm] = useState<"ebay" | "bricklink" | null>(null);
  const [ebayRows, setEbayRows] = useState<Record<number, EbayRow>>({});
  const [blRows, setBlRows] = useState<Record<number, BlRow>>({});
  const storeCats = useQuery({
    queryKey: ["ebay-store-categories"],
    queryFn: () => getEbayStoreCategories({ data: { token: settings.ebayUserToken } }),
    enabled: channel === "ebay",
    staleTime: 10 * 60 * 1000,
  });
  const storeTree = storeCats.data ?? [];
  const storeParents = storeTree.filter((c) => !c.parentId);
  const storeRoots = storeParents.length ? storeParents : storeTree;
  const ebayPremium = ebayPremiumAmount(settings.ebayPremium);

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
  const confirmLots = selectedLots.filter((lot) =>
    confirm === "ebay" ? ebayRows[lot.id] : confirm === "bricklink" ? blRows[lot.id] : false,
  );
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
    setConfirm(null);
  }

  function toggleBricklink() {
    if (channel === "bricklink") return;
    setChannel("bricklink");
    setPicked(new Set());
    setConfirm(null);
  }

  function openConfirm(next: "ebay" | "bricklink") {
    if (next === "ebay") {
      setEbayRows(Object.fromEntries(selectedLots.map((lot) => [lot.id, ebayRowOf(lot, storeTree, ebayPremium)])));
    } else {
      setBlRows(Object.fromEntries(selectedLots.map((lot) => [lot.id, blRowOf(lot)])));
    }
    setConfirm(next);
  }

  useEffect(() => {
    if (confirm !== "ebay" || !storeTree.length) return;
    setEbayRows((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [key, row] of Object.entries(prev)) {
        if (row.storeCategoryId) continue;
        const lot = selectedLots.find((item) => item.id === Number(key));
        if (!lot) continue;
        const mapped = pickStoreMapping(storeTree, lot);
        if (!mapped.category && !mapped.subCategory) continue;
        next[Number(key)] = {
          ...row,
          storeCategoryId: mapped.category?.id ?? "",
          storeCategory2Id: mapped.subCategory?.id ?? "",
        };
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [confirm, storeTree, selectedLots]);

  const bulk = useMutation({
    mutationFn: async (target: "ebay" | "bricklink") => {
      const creds = credentialsOf(settings);
      const results: { ok: number; fail: number } = { ok: 0, fail: 0 };
      for (const lot of confirmLots) {
        try {
          if (target === "ebay") {
            if (lot.ebayListed) continue;
            const row = ebayRows[lot.id];
            const price = Number(row?.price);
            await listOnEbay({
              data: {
                id: lot.id,
                settings: creds,
                patch: {
                  title: row?.title,
                  price: Number.isFinite(price) ? price : null,
                  quantity: Math.max(1, Number(row?.quantity) || 1),
                  categoryId: row?.categoryId,
                  description: row?.description,
                  storeCategoryId: row?.storeCategoryId,
                  storeCategory2Id: row?.storeCategory2Id,
                },
              },
            });
          } else {
            if (lot.blListed) continue;
            const row = blRows[lot.id];
            const price = Number(row?.price);
            await listOnBricklink({
              data: {
                id: lot.id,
                settings: creds,
                patch: {
                  unitPrice: Number.isFinite(price) ? price : undefined,
                  description: row?.description,
                },
              },
            });
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
    onSuccess: (res, target) => {
      qc.invalidateQueries({ queryKey: ["sets"] });
      setPicked(new Set());
      setConfirm(null);
      const name = target === "ebay" ? "eBay" : "BrickLink";
      if (res.ok) toast.success(`Listed ${res.ok} on ${name}${res.fail ? ` · ${res.fail} failed` : ""}`);
      else if (res.fail) toast.error(`Nothing listed on ${name}`);
    },
  });

  if (confirm) {
    const name = confirm === "ebay" ? "eBay" : "BrickLink";
    return (
      <section className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-[26px] leading-[1.15] font-extrabold tracking-tight text-navy">
              Confirm {name} listings
            </h1>
            <p className="mt-2 text-[16px] leading-snug text-fg">
              Edit fields, then confirm to list {confirmLots.length} item{confirmLots.length === 1 ? "" : "s"}
            </p>
            {confirm === "ebay" && ebayPremium !== 0 ? (
              <p className="mt-1 text-sm text-muted">
                eBay premium {ebayPremium > 0 ? "+" : ""}
                {formatMoney(ebayPremium, "GBP")} added to each listing price
              </p>
            ) : null}
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={() => setConfirm(null)}>
            <ChevronLeft />
            Back
          </Button>
        </div>

        <div className="overflow-hidden rounded-md bg-surface shadow-[var(--shadow-border)]">
          <div className="max-h-[min(70dvh,720px)] overflow-auto">
            <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-surface-2 text-left text-xs text-muted">
                  <th className="sticky left-0 z-20 bg-surface-2 px-3 py-2 font-medium"> </th>
                  {confirm === "ebay" ? (
                    <>
                      <th className="px-3 py-2 font-medium">Title</th>
                      <th className="px-3 py-2 font-medium">Price</th>
                      <th className="px-3 py-2 font-medium">Qty</th>
                      <th className="px-3 py-2 font-medium">eBay cat</th>
                      <th className="px-3 py-2 font-medium">Store category</th>
                      <th className="px-3 py-2 font-medium">Store subcat</th>
                      <th className="px-3 py-2 font-medium">Description</th>
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-2 font-medium">Item</th>
                      <th className="px-3 py-2 font-medium">Price</th>
                      <th className="px-3 py-2 font-medium">Description</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {confirmLots.map((lot) => {
                  const ebay = ebayRows[lot.id];
                  const bl = blRows[lot.id];
                  return (
                    <tr key={lot.id} className="align-top border-b border-border">
                      <td className="sticky left-0 z-10 bg-surface px-3 py-2">
                        <span className="flex size-12 items-center overflow-hidden rounded-sm bg-white">
                          {lot.imageUrl ? (
                            <img src={lot.imageUrl} alt="" className="size-full object-contain" />
                          ) : null}
                        </span>
                      </td>
                      {confirm === "ebay" && ebay ? (
                        <>
                          <td className="px-3 py-2">
                            <Input
                              value={ebay.title}
                              maxLength={80}
                              className="min-w-72"
                              onChange={(e) =>
                                setEbayRows((prev) => ({
                                  ...prev,
                                  [lot.id]: { ...ebay, title: e.target.value },
                                }))
                              }
                            />
                            <p className="mt-1 text-[11px] text-subtle">{ebay.title.length}/80</p>
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              inputMode="decimal"
                              className="w-24"
                              value={ebay.price}
                              onChange={(e) =>
                                setEbayRows((prev) => ({
                                  ...prev,
                                  [lot.id]: { ...ebay, price: e.target.value },
                                }))
                              }
                            />
                            {ebayPremium !== 0 ? (
                              <p className="mt-1 text-[11px] text-subtle">
                                incl. {ebayPremium > 0 ? "+" : ""}
                                {formatMoney(ebayPremium, "GBP")} premium
                              </p>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={1}
                              className="w-16"
                              value={ebay.quantity}
                              onChange={(e) =>
                                setEbayRows((prev) => ({
                                  ...prev,
                                  [lot.id]: { ...ebay, quantity: e.target.value },
                                }))
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              className="w-24 font-mono"
                              value={ebay.categoryId}
                              onChange={(e) =>
                                setEbayRows((prev) => ({
                                  ...prev,
                                  [lot.id]: { ...ebay, categoryId: e.target.value },
                                }))
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Select
                              value={ebay.storeCategoryId || STORE_NONE}
                              onValueChange={(id) =>
                                setEbayRows((prev) => ({
                                  ...prev,
                                  [lot.id]: {
                                    ...ebay,
                                    storeCategoryId: id === STORE_NONE ? "" : id,
                                    storeCategory2Id:
                                      id !== STORE_NONE &&
                                      storeTree.some((c) => c.id === ebay.storeCategory2Id && c.parentId === id)
                                        ? ebay.storeCategory2Id
                                        : "",
                                  },
                                }))
                              }
                            >
                              <SelectTrigger className="min-w-44">
                                <SelectValue placeholder={storeCats.isPending ? "Loading…" : "None"} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={STORE_NONE}>None</SelectItem>
                                {storeRoots.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-3 py-2">
                            <Select
                              value={ebay.storeCategory2Id || STORE_NONE}
                              onValueChange={(id) =>
                                setEbayRows((prev) => ({
                                  ...prev,
                                  [lot.id]: { ...ebay, storeCategory2Id: id === STORE_NONE ? "" : id },
                                }))
                              }
                              disabled={!ebay.storeCategoryId}
                            >
                              <SelectTrigger className="min-w-44">
                                <SelectValue placeholder="None" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={STORE_NONE}>None</SelectItem>
                                {storeTree
                                  .filter((c) => c.parentId === ebay.storeCategoryId)
                                  .map((c) => (
                                    <SelectItem key={c.id} value={c.id}>
                                      {c.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-3 py-2">
                            <Textarea
                              className="min-h-20 min-w-80"
                              value={ebay.description}
                              onChange={(e) =>
                                setEbayRows((prev) => ({
                                  ...prev,
                                  [lot.id]: { ...ebay, description: e.target.value },
                                }))
                              }
                            />
                          </td>
                        </>
                      ) : bl ? (
                        <>
                          <td className="px-3 py-2">
                            <p className="min-w-48 font-semibold">{lot.name}</p>
                            <p className="font-mono text-[11px] text-subtle">
                              {itemNumberDisplay(lot.setNum, lot.itemType)} · {lot.sku}
                            </p>
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              inputMode="decimal"
                              className="w-24"
                              value={bl.price}
                              onChange={(e) =>
                                setBlRows((prev) => ({
                                  ...prev,
                                  [lot.id]: { ...bl, price: e.target.value },
                                }))
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Textarea
                              className="min-h-20 min-w-80"
                              value={bl.description}
                              onChange={(e) =>
                                setBlRows((prev) => ({
                                  ...prev,
                                  [lot.id]: { ...bl, description: e.target.value },
                                }))
                              }
                            />
                          </td>
                        </>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="sticky bottom-0 flex gap-2 border-t border-border bg-surface p-3">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={!confirmLots.length || bulk.isPending}
              onClick={() => bulk.mutate(confirm)}
            >
              {bulk.isPending ? <Loader2 className="animate-spin" /> : <Store />}
              Confirm · list {confirmLots.length} on {name}
            </Button>
          </div>
        </div>
      </section>
    );
  }

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
          disabled={!selectedLots.length || !apis.ebayPublish}
          onClick={() => openConfirm("ebay")}
        >
          <Store />
          List {selectedLots.length || ""} on eBay
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="w-full"
          disabled={!selectedLots.length || !apis.bricklink}
          onClick={() => openConfirm("bricklink")}
        >
          <Store />
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
