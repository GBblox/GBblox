import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  ChevronDown,
  Download,
  ExternalLink,
  Loader2,
  Pencil,
  Printer,
  RefreshCw,
  Store,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PrintLabelDialog } from "@/components/print-label-dialog";
import { LocationSelect } from "@/components/location-select";
import { InclusionSelect } from "@/components/inclusion-select";
import { ImagePicker } from "@/components/image-picker";
import { BatchNumberSelect } from "@/components/batch-select";
import { ChannelMark } from "@/components/channel-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteSet,
  exportListingCsv,
  listOnBricklink,
  listOnEbay,
  previewListing,
  refreshCatalog,
  refreshPrice,
  syncListings,
  updateSet,
} from "@/lib/server/sets";
import { bricklinkCanSync, credentialsOf, ebayCanPublish, useSettings } from "@/lib/settings";
import {
  bricklinkUrl,
  channelBadgeVariant,
  channelLabel,
  conditionCode,
  conditionLabel,
  formatMoney,
  formatWeight,
  itemNumberDisplay,
  itemTypeLabel,
  rebrickableBuyUrl,
  setNumberDisplay,
  statusBadgeVariant,
  statusLabel,
} from "@/lib/format";
import { CONDITIONS, type Condition, type Inclusion, type LegoSet, type Status } from "@/lib/types";
import { ebayItemSpecifics, type ListingDraft } from "@/lib/ebay";
import { completenessLabel, composeBricklinkListing } from "@/lib/bricklink-listing";

function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function SetDetail({
  set,
  onClose,
}: {
  set: LegoSet | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const settings = useSettings();
  const [condition, setCondition] = useState<Condition>("used_complete");
  const [comesWithInstructions, setComesWithInstructions] = useState<Inclusion>("na");
  const [comesWithBox, setComesWithBox] = useState<Inclusion>("na");
  const [status, setStatus] = useState<Status>("for_sale");
  const [qty, setQty] = useState("1");
  const [asking, setAsking] = useState("");
  const [notes, setNotes] = useState("");
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState("");
  const [subCategory, setSubCategory] = useState("");
  const [yearReleased, setYearReleased] = useState("");
  const [itemWeight, setItemWeight] = useState("");
  const [sku, setSku] = useState("");
  const [location, setLocation] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [extraPhotos, setExtraPhotos] = useState<string[]>([]);
  const [printOpen, setPrintOpen] = useState(false);
  const [printField, setPrintField] = useState<"sku" | "location">("sku");
  const [editing, setEditing] = useState(false);
  const [ebayOpen, setEbayOpen] = useState(false);
  const [bricklinkOpen, setBricklinkOpen] = useState(false);

  const hydrate = (row: LegoSet) => {
    setCondition(row.condition);
    setComesWithInstructions(row.comesWithInstructions ?? "na");
    setComesWithBox(row.comesWithBox ?? "na");
    setStatus(row.status);
    setQty(String(row.qty));
    setAsking(row.askingPrice == null ? "" : String(row.askingPrice));
    setNotes(row.notes);
    setItemName(row.name);
    setCategory(row.category ?? "");
    setSubCategory(row.subCategory ?? "");
    setYearReleased(row.year == null ? "" : String(row.year));
    setItemWeight(row.weightGrams == null ? "" : String(row.weightGrams));
    setSku(row.sku);
    setLocation(row.location ?? "");
    setBatchNumber(row.batchNumber ?? "");
    setExtraPhotos(row.extraPhotos ?? []);
  };

  useEffect(() => {
    if (!set) return;
    hydrate(set);
    setEditing(false);
    setEbayOpen(false);
    setBricklinkOpen(false);
  }, [set]);

  const fieldClass = editing
    ? undefined
    : "shadow-none focus-visible:ring-0 read-only:cursor-default";
  const lotFieldClass = editing
    ? undefined
    : "shadow-[var(--shadow-border-line)] focus-visible:ring-0 read-only:cursor-default";
  const blockClass = editing ? "bg-[#dde3eb]" : "bg-surface-2";

  const preview = useQuery({
    queryKey: ["listing", set?.id, settings.marketplace],
    queryFn: () =>
      previewListing({ data: { id: set!.id, marketplace: settings.marketplace } }),
    enabled: Boolean(set),
  });

  const save = useMutation({
    mutationFn: () => {
      if (!set) throw new Error("No set");
      const price = asking.trim() === "" ? null : Number(asking);
      if (asking.trim() && !Number.isFinite(price)) throw new Error("Price is not a number.");
      const year = yearReleased.trim() === "" ? null : Number(yearReleased);
      if (yearReleased.trim() && !Number.isFinite(year)) throw new Error("Year is not a number.");
      const weight = itemWeight.trim() === "" ? null : Number(itemWeight);
      if (itemWeight.trim() && !Number.isFinite(weight)) throw new Error("Weight is not a number.");
      return updateSet({
        data: {
          id: set.id,
          sku: sku.trim() || set.sku,
          location: location.trim(),
          name: itemName.trim() || set.name,
          category: category.trim() || null,
          subCategory: subCategory.trim() || null,
          year,
          weightGrams: weight,
          condition,
          comesWithInstructions,
          comesWithBox,
          status,
          qty: Math.max(1, Number(qty) || 1),
          askingPrice: price,
          notes,
          extraPhotos,
          batchNumber: batchNumber.trim(),
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sets"] });
      toast.success("Saved");
      setEditing(false);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Save failed"),
  });

  const catalog = useMutation({
    mutationFn: () => refreshCatalog({ data: { id: set!.id, settings: credentialsOf(settings) } }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["sets"] });
      setItemName(row.name);
      setCategory(row.category ?? "");
      setSubCategory(row.subCategory ?? "");
      setYearReleased(row.year == null ? "" : String(row.year));
      setItemWeight(row.weightGrams == null ? "" : String(row.weightGrams));
      toast.success("Catalog fields updated");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Catalog lookup failed"),
  });

  const price = useMutation({
    mutationFn: () =>
      refreshPrice({
        data: {
          id: set!.id,
          ebayClientId: settings.ebayClientId,
          ebayClientSecret: settings.ebayClientSecret,
          blConsumerKey: settings.blConsumerKey,
          blConsumerSecret: settings.blConsumerSecret,
          blToken: settings.blToken,
          blTokenSecret: settings.blTokenSecret,
          marketplace: settings.marketplace,
        },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["sets"] });
      const cond = set?.condition;
      const isNew = cond === "new_sealed" || cond === "new_opened";
      const avg = isNew ? (res.price.new ?? res.price.used) : (res.price.used ?? res.price.new);
      if (avg != null) setAsking(String(avg));
      if (res.price.used != null || res.price.new != null) {
        toast.success(res.price.message ?? "BrickLink price guide updated");
      } else {
        toast(res.price.message ?? "No BrickLink prices");
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Price lookup failed"),
  });

  const publish = useMutation({
    mutationFn: () =>
      listOnEbay({
        data: { id: set!.id, settings: { ...credentialsOf(settings), marketplace: "EBAY_GB" } },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["sets"] });
      toast.success("Listed on eBay");
      window.open(res.url, "_blank", "noopener");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Listing failed"),
  });

  const publishBl = useMutation({
    mutationFn: () => listOnBricklink({ data: { id: set!.id, settings: credentialsOf(settings) } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["sets"] });
      toast.success("Listed on BrickLink");
      window.open(res.url, "_blank", "noopener");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "BrickLink listing failed"),
  });

  const match = useMutation({
    mutationFn: () => syncListings({ data: { id: set!.id, settings: credentialsOf(settings) } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["sets"] });
      const row = res.sets[0];
      const summary = `SKU ${row?.sku ?? ""} · eBay ${channelLabel(row?.ebayListingStatus)} · BrickLink ${channelLabel(row?.blListingStatus)}`;
      if (res.warning) toast.message(summary, { description: res.warning });
      else toast.success(summary);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Match failed"),
  });

  const csv = useMutation({
    mutationFn: () => exportListingCsv({ data: { id: set!.id, settings: credentialsOf(settings) } }),
    onSuccess: (res) => {
      downloadText(res.filename, res.csv, "text/csv");
      toast.success("File Exchange CSV downloaded");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Export failed"),
  });

  const remove = useMutation({
    mutationFn: () => deleteSet({ data: { id: set!.id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sets"] });
      toast.success("Removed from store");
      onClose();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not delete"),
  });

  const draft = preview.data?.draft;
  const canPublish = ebayCanPublish(settings);
  const canBl = bricklinkCanSync(settings);
  const code = set ? conditionCode(set.condition) : "U";

  return (
    <>
    <Sheet
      open={Boolean(set)}
      onOpenChange={(o) => {
        if (!o && (printOpen || ebayOpen || bricklinkOpen)) return;
        if (!o) onClose();
      }}
    >
      <SheetContent
        className="overflow-y-auto"
        onPointerDownOutside={(e) => {
          if (printOpen || ebayOpen || bricklinkOpen) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (printOpen || ebayOpen || bricklinkOpen) e.preventDefault();
        }}
        onFocusOutside={(e) => {
          if (printOpen || ebayOpen || bricklinkOpen) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (printOpen) {
            e.preventDefault();
            setPrintOpen(false);
            return;
          }
          if (ebayOpen) {
            e.preventDefault();
            setEbayOpen(false);
            return;
          }
          if (bricklinkOpen) {
            e.preventDefault();
            setBricklinkOpen(false);
          }
        }}
      >
        {set && (
          <>
            <SheetHeader>
              <div className="flex items-start gap-3 pr-6">
                <span className="size-16 shrink-0 overflow-hidden rounded-sm bg-white outline outline-1 -outline-offset-1 outline-fg/10">
                  {set.imageUrl ? (
                    <img src={set.imageUrl} alt="" className="size-full object-contain p-0.5" />
                  ) : null}
                </span>
                <div className="min-w-0">
                  <p className="font-mono text-xs font-medium text-link">{itemNumberDisplay(set.setNum, set.itemType)}</p>
                  <p className="font-mono text-[11px] text-subtle">{set.sku}</p>
                  <SheetTitle>{set.name}</SheetTitle>
                  <SheetDescription>
                    {[
                      set.year,
                      set.category,
                      set.subCategory,
                      set.numParts ? `${set.numParts.toLocaleString()} pcs` : null,
                      set.weightGrams != null ? formatWeight(set.weightGrams) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </SheetDescription>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge variant={code === "N" ? "new" : "used"}>{code}</Badge>
                    <Badge variant="default">{itemTypeLabel(set.itemType)}</Badge>
                    <Badge variant={statusBadgeVariant(set.status)}>{statusLabel(set.status)}</Badge>
                    {set.ebayListed ? <ChannelMark channel="ebay" /> : null}
                    {set.blListed ? <ChannelMark channel="bricklink" /> : null}
                    {set.location ? <Badge variant="location">{set.location}</Badge> : null}
                  </div>
                </div>
              </div>
            </SheetHeader>

            <div className="flex justify-end px-5 pb-3">
              {editing ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    type="button"
                    onClick={() => {
                      hydrate(set);
                      setEditing(false);
                    }}
                  >
                    <X />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    disabled={save.isPending}
                    onClick={() => save.mutate()}
                  >
                    {save.isPending ? <Loader2 className="animate-spin" /> : null}
                    Save
                  </Button>
                </div>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="w-fit shrink-0 px-2.5">
                      <ChevronDown />
                      Actions
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onSelect={() => setEditing(true)}>
                      <Pencil className="size-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setBricklinkOpen(false);
                        setEbayOpen(true);
                      }}
                    >
                      <Store className="size-4" />
                      eBay information
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setEbayOpen(false);
                        setBricklinkOpen(true);
                      }}
                    >
                      <Boxes className="size-4" />
                      BrickLink information
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            <div className="space-y-6 px-5 pb-10">
              <div className={`grid grid-cols-2 gap-3 rounded-md ${blockClass} p-4`}>
                <div className="col-span-2 space-y-2 sm:col-span-1">
                  <Label htmlFor="d-sku">SKU</Label>
                  <div className="flex gap-2">
                    <Input
                      id="d-sku"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      readOnly={!editing}
                      className={`font-mono ${fieldClass ?? ""}`}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      className="h-10 px-3"
                      aria-label="Print SKU label"
                      onClick={() => {
                        setPrintField("sku");
                        setPrintOpen(true);
                      }}
                    >
                      <Printer />
                    </Button>
                  </div>
                </div>
                <div className="col-span-2 space-y-2 sm:col-span-1">
                  <Label htmlFor="d-loc">Location</Label>
                  <div className="flex gap-2">
                    <div className="min-w-0 flex-1">
                      <LocationSelect
                        id="d-loc"
                        value={location}
                        onChange={setLocation}
                        disabled={!editing}
                        className={fieldClass}
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      className="h-10 px-3"
                      aria-label="Print location label"
                      disabled={!location.trim()}
                      onClick={() => {
                        setPrintField("location");
                        setPrintOpen(true);
                      }}
                    >
                      <Printer />
                    </Button>
                  </div>
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Batch number</Label>
                  <BatchNumberSelect
                    value={batchNumber}
                    onChange={setBatchNumber}
                    disabled={!editing}
                    className={fieldClass}
                  />
                </div>
              </div>
              <div className={`overflow-hidden rounded-md ${blockClass}`}>
                <div className="flex items-center justify-between border-b border-border px-4 py-2">
                  <p className="text-sm font-semibold">BrickLink catalog</p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!editing || catalog.isPending}
                    onClick={() => catalog.mutate()}
                  >
                    {catalog.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                    Fill
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3 p-4">
                  <div className="col-span-2 space-y-2">
                    <Label htmlFor="d-name">Item Name</Label>
                    <Input
                      id="d-name"
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      readOnly={!editing}
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="d-cat">Category</Label>
                    <Input
                      id="d-cat"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      readOnly={!editing}
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="d-sub">Sub Category</Label>
                    <Input
                      id="d-sub"
                      value={subCategory}
                      onChange={(e) => setSubCategory(e.target.value)}
                      readOnly={!editing}
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="d-year">Year Released</Label>
                    <Input
                      id="d-year"
                      inputMode="numeric"
                      value={yearReleased}
                      onChange={(e) => setYearReleased(e.target.value)}
                      readOnly={!editing}
                      className={fieldClass}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="d-weight">Item Weight (g)</Label>
                    <Input
                      id="d-weight"
                      inputMode="decimal"
                      value={itemWeight}
                      onChange={(e) => setItemWeight(e.target.value)}
                      readOnly={!editing}
                      className={fieldClass}
                    />
                  </div>
                </div>
              </div>

              <div className={`overflow-hidden rounded-md ${blockClass}`}>
                <div className="flex items-center justify-between border-b border-border px-4 py-2">
                  <p className="text-sm font-semibold">Channels</p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={match.isPending || (!canPublish && !canBl)}
                    onClick={() => match.mutate()}
                  >
                    {match.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                    Match SKU
                  </Button>
                </div>
                <ul className="divide-y divide-border text-sm">
                  <li className="grid grid-cols-[4.5rem_minmax(0,1fr)_6.75rem] items-start gap-x-3 px-4 py-3">
                    <p className="pt-0.5 font-semibold leading-5">eBay</p>
                    <div className="min-w-0">
                      <p className="text-xs leading-5 text-muted">
                        {canPublish
                          ? `Matched by SKU ${set.sku}`
                          : "Add an eBay user token in Settings to match"}
                      </p>
                      {set.ebayListingUrl && (
                        <a
                          href={set.ebayListingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs text-link underline-offset-2 hover:underline"
                        >
                          {set.ebayItemId ? `#${set.ebayItemId}` : "Open listing"}
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                    <Badge
                      variant={channelBadgeVariant(set.ebayListed ? "listed" : set.ebayListingStatus)}
                      className="w-full justify-center text-center"
                    >
                      {channelLabel(set.ebayListingStatus)}
                    </Badge>
                  </li>
                  <li className="grid grid-cols-[4.5rem_minmax(0,1fr)_6.75rem] items-start gap-x-3 px-4 py-3">
                    <p className="pt-0.5 font-semibold leading-5">BrickLink</p>
                    <div className="min-w-0">
                      <p className="text-xs leading-5 text-muted">
                        {canBl
                          ? set.blListed
                            ? `Remarks = ${set.sku}`
                            : `Looks up store lots whose Remarks equal SKU ${set.sku}`
                          : "Add BrickLink API keys in Settings to match Remarks to this SKU"}
                      </p>
                      {set.blListingUrl && (
                        <a
                          href={set.blListingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs text-link underline-offset-2 hover:underline"
                        >
                          Lot {set.blInventoryId ?? ""}
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                    <Badge
                      variant={channelBadgeVariant(set.blListed ? "listed" : set.blListingStatus)}
                      className="w-full justify-center text-center"
                    >
                      {channelLabel(set.blListingStatus)}
                    </Badge>
                  </li>
                </ul>
              </div>

              <div className={`overflow-hidden rounded-md ${blockClass}`}>
                <div className="flex items-center justify-between border-b border-border px-4 py-2">
                  <p className="text-sm font-semibold">Price Guide</p>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={price.isPending}
                    onClick={() => price.mutate()}
                  >
                    {price.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                    Fetch
                  </Button>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs font-semibold tracking-wide text-muted">
                      <th className="px-4 py-2 font-semibold"> </th>
                      <th className="px-2 py-2 font-semibold">Min</th>
                      <th className="px-2 py-2 font-semibold">Avg</th>
                      <th className="px-4 py-2 font-semibold">Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="tabular-nums">
                      <td className="px-4 py-3 text-muted">Used</td>
                      <td className="px-2 py-3 font-semibold">
                        {formatMoney(set.usedPriceMin, set.currency)}
                      </td>
                      <td className="px-2 py-3 font-display text-base font-extrabold">
                        {formatMoney(set.usedPrice, set.currency)}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {formatMoney(set.usedPriceMax, set.currency)}
                      </td>
                    </tr>
                    <tr className="border-t border-border/70 tabular-nums">
                      <td className="px-4 py-3 text-muted">New</td>
                      <td className="px-2 py-3 font-semibold">
                        {formatMoney(set.newPriceMin, set.currency)}
                      </td>
                      <td className="px-2 py-3 font-display text-base font-extrabold">
                        {formatMoney(set.newPrice ?? set.retailPrice, set.currency)}
                      </td>
                      <td className="px-4 py-3 font-semibold">
                        {formatMoney(set.newPriceMax, set.currency)}
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p className="border-t border-border px-4 py-2 text-xs text-subtle">
                  {set.usedPriceSource?.startsWith("bricklink")
                    ? "BrickLink current items for sale · qty-weighted average"
                    : set.usedPriceSource === "ebay_used"
                      ? "Min / avg / max from live used eBay comps"
                      : bricklinkCanSync(settings)
                        ? "Fetch current BrickLink items for sale, then Price fills with the average"
                        : "Add BrickLink API keys in Settings, then Fetch"}
                </p>
                <div className="flex flex-wrap gap-3 border-t border-border px-4 py-2 text-xs">
                  <a
                    className="text-link underline-offset-2 hover:underline"
                    href={rebrickableBuyUrl(set.setNum, set.itemType)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Rebrickable buy tab
                  </a>
                  <a
                    className="text-link underline-offset-2 hover:underline"
                    href={bricklinkUrl(set.setNum, set.itemType)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    BrickLink catalog
                  </a>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-white p-4">
                <div className="space-y-2">
                  <Label>Condition</Label>
                  <Select
                    value={condition}
                    onValueChange={(v) => {
                      const next = v as Condition;
                      setCondition(next);
                      if (set.itemType === "minifig") return;
                      const nextInc = next.startsWith("new") ? "yes" : "no";
                      setComesWithInstructions(nextInc);
                      setComesWithBox(nextInc);
                    }}
                    disabled={!editing}
                  >
                    <SelectTrigger className={lotFieldClass} data-readonly={!editing || undefined}>
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
                  <Label>Status</Label>
                  <Select
                    value={status === "sold" ? "sold" : "for_sale"}
                    onValueChange={(v) => setStatus(v === "sold" ? "sold" : "for_sale")}
                    disabled={!editing}
                  >
                    <SelectTrigger className={lotFieldClass} data-readonly={!editing || undefined}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="for_sale">Available</SelectItem>
                      <SelectItem value="sold">Sold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="d-inst">Comes with Instructions</Label>
                  <InclusionSelect
                    id="d-inst"
                    value={comesWithInstructions}
                    onChange={setComesWithInstructions}
                    disabled={!editing}
                    className={lotFieldClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="d-box">Comes with Box</Label>
                  <InclusionSelect
                    id="d-box"
                    value={comesWithBox}
                    onChange={setComesWithBox}
                    disabled={!editing}
                    className={lotFieldClass}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="d-qty">Qty</Label>
                  <div
                    id="d-qty"
                    title="Quantity is set when the lot is added"
                    className="flex h-10 items-center rounded-md bg-surface-2 px-3 text-sm text-muted shadow-[var(--shadow-border-line)]"
                  >
                    <span className="tabular-nums">{qty || "—"}</span>
                    <span className="sr-only">Quantity is not editable</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="d-ask">Price</Label>
                  <Input
                    id="d-ask"
                    inputMode="decimal"
                    value={asking}
                    onChange={(e) => setAsking(e.target.value)}
                    placeholder={set.usedPrice != null ? String(set.usedPrice) : "0"}
                    readOnly={!editing}
                    className={lotFieldClass}
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="d-notes">Notes</Label>
                  <Textarea
                    id="d-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Box condition, missing pieces, extras…"
                    readOnly={!editing}
                    className={lotFieldClass}
                  />
                </div>
                <div className="col-span-2">
                  <ImagePicker values={extraPhotos} onChange={setExtraPhotos} disabled={!editing} />
                </div>
              </div>
              {editing ? (
                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={save.isPending}
                  onClick={() => save.mutate()}
                >
                  {save.isPending ? <Loader2 className="animate-spin" /> : null}
                  Save changes
                </Button>
              ) : null}

              <Button
                variant="ghost"
                className="w-full text-danger hover:text-danger"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(`Remove ${setNumberDisplay(set.setNum)} ${set.name}?`)) {
                    remove.mutate();
                  }
                }}
              >
                <Trash2 />
                Remove from store
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
    <EbayInfoSheet
      open={ebayOpen}
      onClose={() => setEbayOpen(false)}
      lot={set}
      draft={draft}
      publishPending={publish.isPending}
      csvPending={csv.isPending}
      onPublish={() => publish.mutate()}
      onCsv={() => csv.mutate()}
    />
    <BricklinkInfoSheet
      open={bricklinkOpen}
      onClose={() => setBricklinkOpen(false)}
      lot={set}
      listPending={publishBl.isPending}
      onList={() => publishBl.mutate()}
    />
    <PrintLabelDialog
      lot={
        set
          ? {
              sku,
              location,
              name: itemName || set.name,
              setNum: set.setNum,
              itemType: set.itemType,
              barcodeField: printField,
            }
          : null
      }
      open={printOpen}
      onOpenChange={setPrintOpen}
    />
    </>
  );
}

function EbayInfoSheet({
  open,
  onClose,
  lot,
  draft,
  publishPending,
  csvPending,
  onPublish,
  onCsv,
}: {
  open: boolean;
  onClose: () => void;
  lot: LegoSet | null;
  draft: ListingDraft | undefined;
  publishPending: boolean;
  csvPending: boolean;
  onPublish: () => void;
  onCsv: () => void;
}) {
  const specifics = lot ? ebayItemSpecifics(lot) : [];
  const description = draft
    ? draft.descriptionHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    : "";

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="z-[60] overflow-y-auto">
        {lot ? (
          <>
            <SheetHeader>
              <div className="flex items-start gap-3 pr-6">
                <span className="size-16 shrink-0 overflow-hidden rounded-sm bg-white outline outline-1 -outline-offset-1 outline-fg/10">
                  {lot.imageUrl || draft?.pictureUrl ? (
                    <img src={lot.imageUrl ?? draft?.pictureUrl ?? ""} alt="" className="size-full object-contain p-0.5" />
                  ) : null}
                </span>
                <div className="min-w-0">
                  <p className="font-mono text-xs font-medium text-link">
                    {itemNumberDisplay(lot.setNum, lot.itemType)}
                  </p>
                  <p className="font-mono text-[11px] text-subtle">{draft?.sku ?? lot.sku}</p>
                  <SheetTitle>eBay information</SheetTitle>
                  <SheetDescription>
                    Prefilled listing fields GBblox will send to eBay.
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>
            <div className="space-y-5 px-5 pb-10">
              {draft ? (
                <div className="space-y-4 rounded-md bg-surface-2 p-4">
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase">Title</p>
                    <p className="mt-1 text-sm leading-snug font-semibold">{draft.title}</p>
                    <p className="mt-0.5 text-xs text-subtle">{draft.title.length}/80</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-semibold tracking-wide text-muted uppercase">SKU</p>
                      <p className="mt-1 font-mono text-sm">{draft.sku}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold tracking-wide text-muted uppercase">Quantity</p>
                      <p className="mt-1 text-sm tabular-nums">{draft.quantity}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold tracking-wide text-muted uppercase">Price</p>
                      <p className="mt-1 font-display text-lg font-extrabold tabular-nums">
                        {draft.price != null ? formatMoney(draft.price, lot.currency) : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold tracking-wide text-muted uppercase">Condition</p>
                      <p className="mt-1 text-sm">{conditionLabel(lot.condition)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold tracking-wide text-muted uppercase">Category ID</p>
                      <p className="mt-1 font-mono text-sm">{draft.categoryId}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold tracking-wide text-muted uppercase">Condition ID</p>
                      <p className="mt-1 font-mono text-sm">{draft.conditionId}</p>
                    </div>
                  </div>
                  {specifics.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold tracking-wide text-muted uppercase">Item specifics</p>
                      <dl className="mt-2 space-y-1.5">
                        {specifics.map(([name, value]) => (
                          <div key={name} className="flex justify-between gap-3 text-sm">
                            <dt className="text-muted">{name}</dt>
                            <dd className="text-right font-semibold">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : null}
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase">Description</p>
                    <p className="mt-1 text-sm leading-relaxed text-fg">{description}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">Loading listing fields…</p>
              )}
              <div className="grid gap-2">
                {lot.ebayListed ? (
                  <Button
                    type="button"
                    disabled
                    className="bg-success text-surface hover:bg-success hover:text-surface disabled:opacity-100"
                  >
                    Already listed on eBay
                  </Button>
                ) : (
                  <Button disabled={publishPending} onClick={onPublish}>
                    {publishPending ? <Loader2 className="animate-spin" /> : <Store />}
                    List on eBay
                  </Button>
                )}
                <Button variant="outline" disabled={csvPending} onClick={onCsv}>
                  {csvPending ? <Loader2 className="animate-spin" /> : <Download />}
                  CSV
                </Button>
                {lot.ebayListingUrl ? (
                  <a
                    href={lot.ebayListingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-link underline-offset-2 hover:underline"
                  >
                    View live listing
                    <ExternalLink className="size-3.5" />
                  </a>
                ) : null}
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function BricklinkInfoSheet({
  open,
  onClose,
  lot,
  listPending,
  onList,
}: {
  open: boolean;
  onClose: () => void;
  lot: LegoSet | null;
  listPending: boolean;
  onList: () => void;
}) {
  const draft = lot ? composeBricklinkListing(lot) : null;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="z-[60] overflow-y-auto">
        {lot && draft ? (
          <>
            <SheetHeader>
              <div className="flex items-start gap-3 pr-6">
                <span className="size-16 shrink-0 overflow-hidden rounded-sm bg-white outline outline-1 -outline-offset-1 outline-fg/10">
                  {lot.imageUrl ? (
                    <img src={lot.imageUrl} alt="" className="size-full object-contain p-0.5" />
                  ) : null}
                </span>
                <div className="min-w-0">
                  <p className="font-mono text-xs font-medium text-link">
                    {itemNumberDisplay(lot.setNum, lot.itemType)}
                  </p>
                  <p className="font-mono text-[11px] text-subtle">{draft.remarks}</p>
                  <SheetTitle>BrickLink information</SheetTitle>
                  <SheetDescription>
                    Prefilled inventory fields GBblox will send to BrickLink.
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>
            <div className="space-y-5 px-5 pb-10">
              <div className="space-y-4 rounded-md bg-surface-2 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase">Item no</p>
                    <p className="mt-1 font-mono text-sm">{draft.itemNo}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase">Type</p>
                    <p className="mt-1 text-sm">{draft.itemType === "MINIFIG" ? "Minifigure" : "Set"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase">Condition</p>
                    <p className="mt-1 text-sm">{draft.condition === "N" ? "New" : "Used"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase">Completeness</p>
                    <p className="mt-1 text-sm">{completenessLabel(draft.completeness)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase">Quantity</p>
                    <p className="mt-1 text-sm tabular-nums">{draft.quantity}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold tracking-wide text-muted uppercase">Unit price</p>
                    <p className="mt-1 font-display text-lg font-extrabold tabular-nums">
                      {draft.unitPrice != null ? formatMoney(draft.unitPrice, lot.currency) : "—"}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold tracking-wide text-muted uppercase">Remarks (SKU)</p>
                  <p className="mt-1 font-mono text-sm">{draft.remarks}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold tracking-wide text-muted uppercase">Description</p>
                  <p className="mt-1 text-sm leading-relaxed text-fg">{draft.description}</p>
                </div>
              </div>
              <div className="grid gap-2">
                {lot.blListed ? (
                  <Button
                    type="button"
                    disabled
                    className="bg-success text-surface hover:bg-success hover:text-surface disabled:opacity-100"
                  >
                    Already listed on BrickLink
                  </Button>
                ) : (
                  <Button disabled={listPending} onClick={onList}>
                    {listPending ? <Loader2 className="animate-spin" /> : <Boxes />}
                    List on BrickLink
                  </Button>
                )}
                {lot.blListingUrl ? (
                  <a
                    href={lot.blListingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-link underline-offset-2 hover:underline"
                  >
                    View live listing
                    <ExternalLink className="size-3.5" />
                  </a>
                ) : (
                  <a
                    href={draft.catalogUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-link underline-offset-2 hover:underline"
                  >
                    View on BrickLink
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
              </div>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
