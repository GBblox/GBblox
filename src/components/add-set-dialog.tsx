import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addSet, fetchCatalogDetails, lookupSet, nextSku } from "@/lib/server/sets";
import { listBatches } from "@/lib/server/batches";
import { credentialsOf, useSettings } from "@/lib/settings";
import { generateSku } from "@/lib/sku";
import { marketplaceOf } from "@/lib/format";
import { CONDITIONS, type CatalogHit, type Condition, type Inclusion, type ItemType } from "@/lib/types";
import { LocationSelect } from "@/components/location-select";
import { InclusionSelect } from "@/components/inclusion-select";
import { ImagePicker } from "@/components/image-picker";
import { BatchNumberSelect, batchFieldHint } from "@/components/batch-select";
import { cn } from "@/lib/utils";

export function AddSetDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const settings = useSettings();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [picked, setPicked] = useState<CatalogHit | null>(null);
  const [condition, setCondition] = useState<Condition>("used_complete");
  const [comesWithInstructions, setComesWithInstructions] = useState<Inclusion>("no");
  const [comesWithBox, setComesWithBox] = useState<Inclusion>("no");
  const [qty, setQty] = useState("1");
  const [asking, setAsking] = useState("");
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [yearReleased, setYearReleased] = useState("");
  const [itemWeight, setItemWeight] = useState("");
  const [sku, setSku] = useState("");
  const [location, setLocation] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [extraPhotos, setExtraPhotos] = useState<string[]>([]);
  const [kind, setKind] = useState<ItemType | "all">("all");

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 280);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setDebounced("");
      setPicked(null);
      setCondition("used_complete");
      setComesWithInstructions("no");
      setComesWithBox("no");
      setQty("1");
      setAsking("");
      setItemName("");
      setCategory("");
      setSubCategory("");
      setYearReleased("");
      setItemWeight("");
      setSku("");
      setLocation("");
      setBatchNumber("");
      setExtraPhotos([]);
      setKind("all");
    }
  }, [open]);

  const lookup = useQuery({
    queryKey: ["lookup", debounced, kind, settings.rebrickableApiKey, settings.blConsumerKey],
    queryFn: () =>
      lookupSet({
        data: {
          query: debounced,
          apiKey: settings.rebrickableApiKey,
          itemType: kind === "minifig" ? "minifig" : kind === "set" ? "set" : "all",
          settings: credentialsOf(settings),
        },
      }),
    enabled: open && debounced.length >= 2,
  });

  const details = useQuery({
    queryKey: ["catalog-details", picked?.itemType, picked?.setNum],
    queryFn: () =>
      fetchCatalogDetails({
        data: {
          setNum: picked!.setNum,
          itemType: picked!.itemType === "minifig" ? "minifig" : "set",
          settings: credentialsOf(settings),
        },
      }),
    enabled: Boolean(open && picked),
  });

  const skuPreview = useQuery({
    queryKey: ["next-sku", picked?.itemType, picked?.setNum],
    queryFn: () =>
      nextSku({
        data: { setNum: picked!.setNum, itemType: picked!.itemType === "minifig" ? "minifig" : "set" },
      }),
    enabled: Boolean(open && picked),
  });

  const batchesQuery = useQuery({
    queryKey: ["batches"],
    queryFn: () => listBatches(),
    enabled: open,
  });

  const catalog = details.data ?? picked;

  useEffect(() => {
    if (!catalog) return;
    setItemName(catalog.name);
    setCategory(catalog.category ?? "");
    setSubCategory(catalog.subCategory ?? "");
    setYearReleased(catalog.year != null ? String(catalog.year) : "");
    setItemWeight(catalog.weightGrams != null ? String(catalog.weightGrams) : "");
  }, [catalog]);

  useEffect(() => {
    if (!picked) return;
    setSku(generateSku(picked.setNum, picked.itemType));
    const def: Inclusion =
      picked.itemType === "minifig" ? "na" : condition.startsWith("new") ? "yes" : "no";
    setComesWithInstructions(def);
    setComesWithBox(def);
  }, [picked?.setNum, picked?.itemType]);

  useEffect(() => {
    if (skuPreview.data) setSku(skuPreview.data);
  }, [skuPreview.data]);

  const save = useMutation({
    mutationFn: () => {
      if (!picked) throw new Error("Pick an item first.");
      const price = asking.trim() === "" ? null : Number(asking);
      if (asking.trim() && !Number.isFinite(price)) throw new Error("Price is not a number.");
      const year = yearReleased.trim() === "" ? null : Number(yearReleased);
      if (yearReleased.trim() && !Number.isFinite(year)) throw new Error("Year is not a number.");
      const weight = itemWeight.trim() === "" ? null : Number(itemWeight);
      if (itemWeight.trim() && !Number.isFinite(weight)) throw new Error("Weight is not a number.");
      return addSet({
        data: {
          setNum: picked.setNum,
          sku: sku.trim() || undefined,
          location: location.trim() || undefined,
          itemType: picked.itemType === "minifig" ? "minifig" : "set",
          name: itemName.trim() || picked.name,
          year,
          theme: picked.theme,
          themeId: picked.themeId,
          category: category.trim() || null,
          subCategory: subCategory.trim() || null,
          weightGrams: weight,
          numParts: picked.numParts,
          imageUrl: picked.imageUrl,
          condition,
          comesWithInstructions,
          comesWithBox,
          qty: Math.max(1, Number(qty) || 1),
          askingPrice: price,
          currency: marketplaceOf(settings.marketplace).currency,
          notes: "",
          extraPhotos,
          batchNumber: batchNumber.trim(),
        },
      });
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["sets"] });
      qc.invalidateQueries({ queryKey: ["next-sku"] });
      toast.success(`${row.name} added · ${row.sku}`);
      onOpenChange(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not add set"),
  });

  const hits = lookup.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="icon" aria-label="Add item">
          <Plus />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add to catalog</DialogTitle>
          <DialogDescription>
            Type a BrickLink item number — 75192 for a set, sw0001 for a minifigure. Name, category and year fill in automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="set-query">Item no. or name</Label>
            <div className="flex gap-1">
              {(["all", "set", "minifig"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setKind(k);
                    setPicked(null);
                  }}
                  className={cn(
                    "h-8 rounded-sm px-2.5 text-xs font-semibold",
                    kind === k ? "bg-navy text-navy-fg" : "bg-surface-2 text-muted hover:text-fg",
                  )}
                >
                  {k === "all" ? "All" : k === "set" ? "Sets" : "Minifigs"}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
              <Input
                id="set-query"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPicked(null);
                  setSku("");
                }}
                placeholder="Item number or name"
                className="pl-9"
                autoFocus
              />
            </div>
          </div>

          {lookup.isFetching && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="size-4 animate-spin" />
              Searching catalog
            </p>
          )}
          {lookup.isError && (
            <p className="text-sm text-danger">
              {lookup.error instanceof Error ? lookup.error.message : "Lookup failed"}
            </p>
          )}

          {hits.length > 0 && (
            <ul className="grid gap-2">
              {(picked ? hits.filter((hit) => hit.setNum === picked.setNum && hit.itemType === picked.itemType) : hits).map((hit) => {
                const active = picked?.setNum === hit.setNum && picked?.itemType === hit.itemType;
                return (
                  <li key={`${hit.itemType}-${hit.setNum}`}>
                    <button
                      type="button"
                      onClick={() => setPicked(hit)}
                      className={cn(
                        "flex w-full min-w-0 items-start gap-3 rounded-md p-2 text-left shadow-[var(--shadow-border)] transition-colors",
                        active ? "bg-primary/20 ring-1 ring-primary" : "bg-surface hover:bg-surface-2",
                      )}
                    >
                      <span className="size-14 shrink-0 overflow-hidden rounded-sm bg-white outline outline-1 -outline-offset-1 outline-fg/10">
                        {hit.imageUrl ? (
                          <img
                            src={hit.imageUrl}
                            alt=""
                            className="size-full max-h-full max-w-full object-contain"
                          />
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1 pt-0.5">
                        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-mono text-xs font-medium text-link">{hit.setNum}</span>
                          <span className="rounded-sm bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted uppercase">
                            {hit.itemType === "minifig" ? "Minifig" : "Set"}
                          </span>
                        </span>
                        <span className="mt-0.5 block line-clamp-2 break-words text-sm font-semibold leading-snug">{hit.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-muted">
                          {[hit.year, hit.category, hit.subCategory, hit.numParts ? `${hit.numParts.toLocaleString()} pcs` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {picked && (
            <>
              <div className="grid grid-cols-2 gap-3 rounded-md bg-surface-2 p-3">
                <div className="col-span-2 space-y-2 sm:col-span-1">
                  <Label htmlFor="sku">SKU</Label>
                  <Input
                    id="sku"
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className="font-mono"
                  />
                  <p className="text-xs text-subtle">
                    Auto GBB-SET-0001. eBay custom label and BrickLink Remarks.
                  </p>
                </div>
                <div className="col-span-2 space-y-2 sm:col-span-1">
                  <Label htmlFor="location">Location</Label>
                  <LocationSelect id="location" value={location} onChange={setLocation} />
                  <p className="text-xs text-subtle">
                    {settings.locations?.length
                      ? "Pick a bin from Settings."
                      : "Add bins in Settings, then pick one here."}
                  </p>
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Batch number</Label>
                  <BatchNumberSelect value={batchNumber} onChange={setBatchNumber} />
                  <p className="text-xs text-subtle">
                    {batchFieldHint(batchesQuery.data?.length, batchesQuery.isLoading, batchesQuery.isError)}
                  </p>
                </div>
              </div>
              <div className="space-y-3 rounded-md bg-surface-2 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">BrickLink catalog</p>
                {details.isFetching && (
                  <span className="flex items-center gap-1 text-xs text-muted">
                    <Loader2 className="size-3.5 animate-spin" />
                    Filling fields
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="item-name">Item Name</Label>
                  <Input id="item-name" value={itemName} onChange={(e) => setItemName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cat">Category</Label>
                  <Input id="cat" value={category} onChange={(e) => setCategory(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="subcat">Sub Category</Label>
                  <Input id="subcat" value={subCategory} onChange={(e) => setSubCategory(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="year">Year Released</Label>
                  <Input
                    id="year"
                    inputMode="numeric"
                    value={yearReleased}
                    onChange={(e) => setYearReleased(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight">Item Weight (g)</Label>
                  <Input
                    id="weight"
                    inputMode="decimal"
                    value={itemWeight}
                    onChange={(e) => setItemWeight(e.target.value)}
                    placeholder={details.isFetching ? "Looking up…" : "grams"}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Condition</Label>
                  <Select
                    value={condition}
                    onValueChange={(v) => {
                      const next = v as Condition;
                      setCondition(next);
                      if (picked?.itemType === "minifig") return;
                      const nextInc = next.startsWith("new") ? "yes" : "no";
                      setComesWithInstructions(nextInc);
                      setComesWithBox(nextInc);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONDITIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="qty">Qty</Label>
                  <Input
                    id="qty"
                    inputMode="numeric"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inst">Comes with Instructions</Label>
                  <InclusionSelect id="inst" value={comesWithInstructions} onChange={setComesWithInstructions} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="box">Comes with Box</Label>
                  <InclusionSelect id="box" value={comesWithBox} onChange={setComesWithBox} />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="ask">Price (optional)</Label>
                  <Input
                    id="ask"
                    inputMode="decimal"
                    value={asking}
                    onChange={(e) => setAsking(e.target.value)}
                    placeholder="Leave blank, then fetch used price"
                  />
                </div>
              </div>
            </div>
            </>
          )}

          {picked ? (
            <div className="space-y-3 rounded-md bg-surface-2 p-3">
              <p className="text-sm font-semibold">Your photos</p>
              <ImagePicker values={extraPhotos} onChange={setExtraPhotos} label={false} />
            </div>
          ) : null}

          <Button
            className="w-full"
            disabled={!picked || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            Add to store
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
