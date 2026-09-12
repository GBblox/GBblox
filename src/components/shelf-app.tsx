import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, CheckSquare, ChevronDown, ClipboardList, LayoutGrid, Layers, List, PackageOpen, Plus, Receipt, RefreshCw, ScanBarcode, Search, Store, Tag, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AddSetDialog } from "@/components/add-set-dialog";
import { AuditPanel } from "@/components/audit-panel";
import { BatchesPanel } from "@/components/batches-panel";
import { ListingsPanel } from "@/components/listings-panel";
import { GbBloxLogo } from "@/components/brick-mark";
import { CsvDialog } from "@/components/csv-dialog";
import { ProductEnquiry } from "@/components/product-enquiry";
import { SalesPanel } from "@/components/sales-panel";
import { SetDetail } from "@/components/set-detail";
import { SettingsSheet } from "@/components/settings-sheet";
import { ChannelMark } from "@/components/channel-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  conditionCode,
  conditionLabel,
  formatMoney,
  itemNumberDisplay,
  itemTypeLabel,
  statusBadgeVariant,
  statusLabel,
} from "@/lib/format";
import { fillBricklinkPrices, listSets, syncListings } from "@/lib/server/sets";
import { bricklinkCanSync, credentialsOf, ebayCanPublish, ebayIsConnected, rehydrateSettings, useSettings } from "@/lib/settings";
import { rehydratePrinterSettings } from "@/lib/printer-settings";
import { shelfBucket, type LegoSet, type ShelfBucket } from "@/lib/types";

type AppView = "home" | ShelfBucket | "sales" | "enquiry" | "audit" | "batches" | "listings";

function categoryKey(lot: LegoSet): string {
  return lot.category?.trim() || "Uncategorised";
}

function sortCategories(names: string[]): string[] {
  return [...names].sort((a, b) => {
    if (a === "Uncategorised") return 1;
    if (b === "Uncategorised") return -1;
    return a.localeCompare(b);
  });
}

function categoryMenuPos(anchor: DOMRect) {
  const width = Math.min(288, window.innerWidth - 16);
  let left = anchor.right - width;
  if (left < 8) left = 8;
  if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - width);
  return {
    top: anchor.bottom + 4,
    left,
    width,
    maxH: Math.max(140, Math.min(320, window.innerHeight - anchor.bottom - 12)),
  };
}

const SHELVES: {
  id: ShelfBucket;
  title: string;
  blurb: string;
  icon: typeof Boxes;
}[] = [
  {
    id: "complete",
    title: "Complete Sets",
    blurb: "Sets marked complete",
    icon: CheckSquare,
  },
  {
    id: "minifig",
    title: "Minifigures",
    blurb: "Available minifigure lots",
    icon: Users,
  },
  {
    id: "incomplete",
    title: "Incomplete Sets",
    blurb: "Incomplete sets",
    icon: PackageOpen,
  },
  {
    id: "sold",
    title: "Sold",
    blurb: "Sold sets & minifigures",
    icon: Receipt,
  },
];

export function ShelfApp() {
  const qc = useQueryClient();
  const settings = useSettings();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [view, setView] = useState<AppView>("home");
  const [layout, setLayout] = useState<"gallery" | "list">("gallery");
  const [grouped, setGrouped] = useState(false);
  const [selectedCats, setSelectedCats] = useState<string[] | "all">("all");
  const [catOpen, setCatOpen] = useState(false);
  const [soldType, setSoldType] = useState<"all" | "set" | "minifig">("all");
  const [catPos, setCatPos] = useState({ top: 0, left: 0, width: 288, maxH: 256 });
  const catMenuRef = useRef<HTMLDivElement>(null);
  const catBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedCats("all");
    setGrouped(false);
    setCatOpen(false);
    setSoldType("all");
  }, [view]);

  useEffect(() => {
    if (!catOpen) return;
    const place = () => {
      const btn = catBtnRef.current;
      if (!btn) return;
      setCatPos(categoryMenuPos(btn.getBoundingClientRect()));
    };
    const onDoc = (e: MouseEvent) => {
      if (
        !catMenuRef.current?.contains(e.target as Node) &&
        !catBtnRef.current?.contains(e.target as Node)
      ) {
        setCatOpen(false);
      }
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [catOpen]);

  useEffect(() => {
    rehydrateSettings();
    rehydratePrinterSettings();
  }, []);

  const setsQuery = useQuery({
    queryKey: ["sets"],
    queryFn: async () => {
      const rows = await listSets();
      return Array.isArray(rows) ? rows : [];
    },
  });

  const matchAll = useMutation({
    mutationFn: () => syncListings({ data: { settings: credentialsOf(settings) } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["sets"] });
      const summary = `Matched SKUs · eBay ${res.ebayMatched} · BrickLink ${res.bricklinkMatched}`;
      if (res.warning) toast.message(summary, { description: res.warning });
      else toast.success(summary);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Match failed"),
  });

  const sets = setsQuery.data ?? [];
  const selected = sets.find((s) => s.id === selectedId) ?? null;

  const catalogSkus = useMemo(
    () => new Set(sets.map((s) => s.sku.trim().toUpperCase()).filter(Boolean)),
    [sets],
  );

  const counts = useMemo(() => {
    const n = { complete: 0, incomplete: 0, sold: 0, minifig: 0 };
    for (const lot of sets) n[shelfBucket(lot)] += 1;
    return n;
  }, [sets]);

  const shelfLots = useMemo(() => {
    if (view === "home" || view === "sales" || view === "enquiry") return [];
    const needle = q.trim().toLowerCase();
    return sets.filter((s) => {
      if (shelfBucket(s) !== view) return false;
      if (view === "sold" && soldType !== "all" && s.itemType !== soldType) return false;
      if (!needle) return true;
      return (
        s.name.toLowerCase().includes(needle) ||
        s.setNum.toLowerCase().includes(needle) ||
        s.sku.toLowerCase().includes(needle) ||
        (s.location ?? "").toLowerCase().includes(needle) ||
        (s.theme ?? "").toLowerCase().includes(needle) ||
        (s.category ?? "").toLowerCase().includes(needle) ||
        (s.subCategory ?? "").toLowerCase().includes(needle)
      );
    });
  }, [sets, view, q, soldType]);

  const availableCategories = useMemo(
    () => sortCategories([...new Set(shelfLots.map(categoryKey))]),
    [shelfLots],
  );

  const activeCats = selectedCats === "all" ? availableCategories : selectedCats;
  const allCatsChecked =
    selectedCats === "all" ||
    (availableCategories.length > 0 && availableCategories.every((c) => activeCats.includes(c)));

  const visible = useMemo(() => {
    if (!grouped || allCatsChecked) return shelfLots;
    const allow = new Set(activeCats);
    return shelfLots.filter((s) => allow.has(categoryKey(s)));
  }, [shelfLots, grouped, allCatsChecked, activeCats]);

  const fillPrices = useMutation({
    mutationFn: async (ids: number[]) => {
      const creds = credentialsOf(settings);
      const chunk = 20;
      let filled = 0;
      let skipped = 0;
      let failed = 0;
      for (let i = 0; i < ids.length; i += chunk) {
        const res = await fillBricklinkPrices({
          data: { ids: ids.slice(i, i + chunk), settings: creds },
        });
        filled += res.filled;
        skipped += res.skipped;
        failed += res.failed;
      }
      return { filled, skipped, failed, total: ids.length };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["sets"] });
      const bits = [`Filled BrickLink prices on ${res.filled} of ${res.total}`];
      if (res.skipped) bits.push(`${res.skipped} had no guide`);
      if (res.failed) bits.push(`${res.failed} failed`);
      if (res.filled === 0 && res.failed === 0) toast.message(bits.join(" · "));
      else if (res.failed) toast.message(bits.join(" · "));
      else toast.success(bits.join(" · "));
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Price fill failed"),
  });

  const groups = useMemo(() => {
    if (!grouped) return [["", visible] as const];
    const map = new Map<string, LegoSet[]>();
    for (const lot of visible) {
      const key = categoryKey(lot);
      const arr = map.get(key);
      if (arr) arr.push(lot);
      else map.set(key, [lot]);
    }
    return sortCategories([...map.keys()]).map((key) => [key, map.get(key) ?? []] as const);
  }, [visible, grouped]);

  const shelf = SHELVES.find((s) => s.id === view);
  const showSearch = view !== "home" && view !== "enquiry" && view !== "sales" && view !== "audit" && view !== "batches" && view !== "listings";

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-40 border-b border-border bg-surface">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-4">
          <button type="button" onClick={() => setView("home")} className="flex items-center" aria-label="GBblox home">
            <GbBloxLogo />
          </button>
          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 sm:max-w-lg">
            {showSearch ? (
              <div className="relative hidden min-w-0 flex-1 sm:block">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search catalog — name or item number"
                  className="pr-12 pl-9"
                  aria-label="Search catalog"
                />
                <span className="pointer-events-none absolute top-1/2 right-1 flex size-8 -translate-y-1/2 items-center justify-center rounded-sm bg-link text-surface">
                  <Search className="size-3.5" />
                </span>
              </div>
            ) : null}
            <SettingsSheet />
            <Button
              size="icon"
              aria-label="Sales"
              className="bg-success text-surface hover:bg-success/90 hover:text-surface"
              onClick={() => setView((v) => (v === "sales" ? "home" : "sales"))}
            >
              <span className="text-lg leading-none font-extrabold">£</span>
            </Button>
            <CsvDialog lots={sets} />
            <AddSetDialog open={addOpen} onOpenChange={setAddOpen} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-12 sm:px-6">
        {view === "sales" ? (
          <div>
            <SalesPanel catalogSkus={catalogSkus} lots={sets} />
          </div>
        ) : view === "enquiry" ? (
          <ProductEnquiry
            lots={sets}
            onBack={() => setView("home")}
            onOpen={(lot) => setSelectedId(lot.id)}
          />
        ) : view === "audit" ? (
          <AuditPanel lots={sets} onOpen={(lot) => setSelectedId(lot.id)} />
        ) : view === "batches" ? (
          <BatchesPanel lots={sets} onOpenLot={(lot) => setSelectedId(lot.id)} />
        ) : view === "listings" ? (
          <ListingsPanel lots={sets} onOpen={(lot) => setSelectedId(lot.id)} />
        ) : view === "home" ? (
          <section>
            <h1 className="font-display text-[26px] leading-[1.15] font-extrabold tracking-tight text-navy">
              Your shelf
            </h1>
            <p className="mt-2 text-[16px] leading-snug text-fg">
              Pick a list to browse lots.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-5 xl:grid-cols-4">
              {SHELVES.map((tile) => {
                const Icon = tile.icon;
                return (
                  <button
                    key={tile.id}
                    type="button"
                    onClick={() => {
                      setQ("");
                      setView(tile.id);
                    }}
                    className="group aspect-square w-full min-w-0 rounded-md bg-surface p-3 text-center shadow-[var(--shadow-border)] transition-[box-shadow,transform] duration-150 ease-[var(--ease-smooth-out)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-border-hover)] sm:p-6"
                  >
                    <div className="flex h-full flex-col items-center justify-center gap-1.5 sm:gap-3">
                      <span className="flex size-10 items-center justify-center rounded-md bg-primary text-navy sm:size-16">
                        <Icon className="size-5 sm:size-8" />
                      </span>
                      <span className="font-display text-[1.0625rem] leading-tight font-extrabold tracking-tight sm:text-xl">
                        {tile.title}
                      </span>
                      <span className="hidden text-sm leading-snug text-muted sm:block">{tile.blurb}</span>
                      <span className="font-display text-xl font-extrabold tabular-nums sm:text-3xl">
                        {counts[tile.id]}
                      </span>
                    </div>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setView("enquiry")}
                className="group aspect-square w-full min-w-0 rounded-md bg-surface p-3 text-center shadow-[var(--shadow-border)] transition-[box-shadow,transform] duration-150 ease-[var(--ease-smooth-out)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-border-hover)] sm:p-6"
              >
                <div className="flex h-full flex-col items-center justify-center gap-1.5 sm:gap-3">
                  <span className="flex size-10 items-center justify-center rounded-md bg-primary text-navy sm:size-16">
                    <ScanBarcode className="size-5 sm:size-8" />
                  </span>
                  <span className="font-display text-[1.0625rem] leading-tight font-extrabold tracking-tight sm:text-xl">
                    Product enquiry
                  </span>
                  <span className="hidden text-sm leading-snug text-muted sm:block">Search or scan a barcode</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setView("audit")}
                className="group aspect-square w-full min-w-0 rounded-md bg-surface p-3 text-center shadow-[var(--shadow-border)] transition-[box-shadow,transform] duration-150 ease-[var(--ease-smooth-out)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-border-hover)] sm:p-6"
              >
                <div className="flex h-full flex-col items-center justify-center gap-1.5 sm:gap-3">
                  <span className="flex size-10 items-center justify-center rounded-md bg-primary text-navy sm:size-16">
                    <ClipboardList className="size-5 sm:size-8" />
                  </span>
                  <span className="font-display text-[1.0625rem] leading-tight font-extrabold tracking-tight sm:text-xl">
                    Audit
                  </span>
                  <span className="hidden text-sm leading-snug text-muted sm:block">Scan lots vs catalog</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setView("batches")}
                className="group aspect-square w-full min-w-0 rounded-md bg-surface p-3 text-center shadow-[var(--shadow-border)] transition-[box-shadow,transform] duration-150 ease-[var(--ease-smooth-out)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-border-hover)] sm:p-6"
              >
                <div className="flex h-full flex-col items-center justify-center gap-1.5 sm:gap-3">
                  <span className="flex size-10 items-center justify-center rounded-md bg-primary text-navy sm:size-16">
                    <Layers className="size-5 sm:size-8" />
                  </span>
                  <span className="font-display text-[1.0625rem] leading-tight font-extrabold tracking-tight sm:text-xl">
                    Batches
                  </span>
                  <span className="hidden text-sm leading-snug text-muted sm:block">Bulk lots items are split from</span>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setView("listings")}
                className="group aspect-square w-full min-w-0 rounded-md bg-surface p-3 text-center shadow-[var(--shadow-border)] transition-[box-shadow,transform] duration-150 ease-[var(--ease-smooth-out)] hover:-translate-y-0.5 hover:shadow-[var(--shadow-border-hover)] sm:p-6"
              >
                <div className="flex h-full flex-col items-center justify-center gap-1.5 sm:gap-3">
                  <span className="flex size-10 items-center justify-center rounded-md bg-primary text-navy sm:size-16">
                    <Store className="size-5 sm:size-8" />
                  </span>
                  <span className="font-display text-[1.0625rem] leading-tight font-extrabold tracking-tight sm:text-xl">
                    Listings
                  </span>
                  <span className="hidden text-sm leading-snug text-muted sm:block">Bulk list on eBay or BrickLink</span>
                </div>
              </button>
            </div>
          </section>
        ) : (
        <>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-[26px] leading-[1.15] font-extrabold tracking-tight text-navy">
                {shelf?.title}
              </h1>
              <p className="mt-2 text-[16px] leading-snug text-fg">
                {shelf?.blurb} · {visible.length} shown
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-md shadow-[var(--shadow-border)]">
              <Button
                variant={layout === "gallery" ? "secondary" : "ghost"}
                size="sm"
                type="button"
                className="rounded-none shadow-none"
                aria-pressed={layout === "gallery"}
                onClick={() => setLayout("gallery")}
              >
                <LayoutGrid />
                Gallery
              </Button>
              <Button
                variant={layout === "list" ? "secondary" : "ghost"}
                size="sm"
                type="button"
                className="rounded-none shadow-none"
                aria-pressed={layout === "list"}
                onClick={() => setLayout("list")}
              >
                <List />
                List
              </Button>
            </div>
            </div>
            <div className="relative ml-auto shrink-0" ref={catBtnRef}>
              <div className="flex origin-center overflow-hidden rounded-md shadow-[var(--shadow-border)] transition-transform duration-150 ease-[var(--ease-smooth-out)] active:scale-[0.98]">
              <Button
                variant={grouped ? "secondary" : "ghost"}
                size="sm"
                type="button"
                className="rounded-none shadow-none active:scale-100"
                aria-pressed={grouped}
                onClick={() => {
                  if (grouped) {
                    setGrouped(false);
                    setSelectedCats("all");
                    setCatOpen(false);
                    return;
                  }
                  setGrouped(true);
                  setSelectedCats("all");
                }}
              >
                <Layers />
                By category
              </Button>
              <Button
                variant={catOpen ? "secondary" : grouped ? "secondary" : "ghost"}
                size="sm"
                type="button"
                className={`rounded-none px-2 shadow-none active:scale-100 ${grouped ? "border-l border-navy-fg/25" : "border-l border-border"}`}
                aria-expanded={catOpen}
                aria-label={catOpen ? "Close category list" : "Filter categories"}
                title={catOpen ? "Close list" : "Filter categories"}
                onClick={() => {
                  if (!grouped) {
                    setGrouped(true);
                    setSelectedCats("all");
                  }
                  if (catOpen) {
                    setCatOpen(false);
                    return;
                  }
                  const btn = catBtnRef.current;
                  if (btn) setCatPos(categoryMenuPos(btn.getBoundingClientRect()));
                  setCatOpen(true);
                }}
              >
                {catOpen ? <X className="size-3.5" /> : <ChevronDown className="size-3.5" />}
              </Button>
              </div>
              {catOpen ? (
                <div
                  ref={catMenuRef}
                  style={{ top: catPos.top, left: catPos.left, width: catPos.width }}
                  className="fixed z-50 overflow-hidden rounded-md bg-surface py-1 shadow-[var(--shadow-border)]"
                >
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-semibold hover:bg-surface-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-navy"
                      checked={allCatsChecked}
                      onChange={() => setSelectedCats(allCatsChecked ? [] : "all")}
                    />
                    Check all
                  </label>
                  <div
                    className="overflow-y-auto border-t border-border"
                    style={{ maxHeight: Math.max(80, catPos.maxH - 44) }}
                  >
                    {availableCategories.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-muted">No categories in this list.</p>
                    ) : (
                      availableCategories.map((cat) => {
                        const checked = allCatsChecked || activeCats.includes(cat);
                        return (
                          <label
                            key={cat}
                            className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface-2"
                          >
                            <input
                              type="checkbox"
                              className="size-4 accent-navy"
                              checked={checked}
                              onChange={() => {
                                const current = allCatsChecked ? availableCategories : activeCats;
                                const next = checked
                                  ? current.filter((c) => c !== cat)
                                  : [...current, cat];
                                setSelectedCats(
                                  next.length === 0
                                    ? []
                                    : next.length === availableCategories.length
                                      ? "all"
                                      : next,
                                );
                              }}
                            />
                            <span className="min-w-0 flex-1 truncate">{cat}</span>
                            <span className="text-xs text-muted tabular-nums">
                              {shelfLots.filter((l) => categoryKey(l) === cat).length}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                  <div className="border-t border-border p-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      className="w-full"
                      onClick={() => setCatOpen(false)}
                    >
                      Done
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          {view === "sold" ? (
            <div className="flex justify-end">
              <div className="inline-flex w-fit overflow-hidden rounded-md bg-surface shadow-[var(--shadow-border)]">
                <Button
                  variant={soldType === "all" ? "secondary" : "ghost"}
                  size="sm"
                  type="button"
                  className="rounded-none px-2.5 shadow-none"
                  aria-pressed={soldType === "all"}
                  onClick={() => setSoldType("all")}
                >
                  All
                </Button>
                <Button
                  variant={soldType === "set" ? "secondary" : "ghost"}
                  size="sm"
                  type="button"
                  className="rounded-none px-2.5 shadow-none"
                  aria-pressed={soldType === "set"}
                  onClick={() => setSoldType("set")}
                >
                  <Boxes />
                  Sets
                </Button>
                <Button
                  variant={soldType === "minifig" ? "secondary" : "ghost"}
                  size="sm"
                  type="button"
                  className="rounded-none px-2.5 shadow-none"
                  aria-pressed={soldType === "minifig"}
                  onClick={() => setSoldType("minifig")}
                >
                  <Users />
                  Minifigures
                </Button>
              </div>
            </div>
          ) : null}
          {(view === "complete" || view === "minifig" || view === "incomplete") && shelfLots.length > 0 ? (
            <div className="flex justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-fit shrink-0 px-2.5"
                    disabled={matchAll.isPending || fillPrices.isPending}
                  >
                    {matchAll.isPending || fillPrices.isPending ? (
                      <RefreshCw className="animate-spin" />
                    ) : (
                      <ChevronDown />
                    )}
                    Actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {view !== "incomplete" ? (
                    <DropdownMenuItem
                      disabled={matchAll.isPending || !(ebayCanPublish(settings) || bricklinkCanSync(settings))}
                      onSelect={() => matchAll.mutate()}
                    >
                      <RefreshCw className="size-4" />
                      Match listings
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem
                    disabled={fillPrices.isPending || !(bricklinkCanSync(settings) || ebayIsConnected(settings)) || visible.length === 0}
                    onSelect={() => fillPrices.mutate(visible.map((lot) => lot.id))}
                  >
                    <Tag className="size-4" />
                    Fill BrickLink pricing
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : null}
          <div className="relative sm:hidden">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search catalog"
              className="pl-9"
              aria-label="Search catalog"
            />
          </div>
        </div>

        <div className="mt-5">
          {setsQuery.isLoading && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[4/5] rounded-md" />
              ))}
            </div>
          )}

          {setsQuery.isError && (
            <p className="rounded-md bg-surface p-4 text-sm text-danger shadow-[var(--shadow-border)]">
              {setsQuery.error instanceof Error ? setsQuery.error.message : "Could not load store"}
            </p>
          )}

          {setsQuery.isSuccess && sets.length === 0 && (
            <EmptyState onAdd={() => setAddOpen(true)} />
          )}

          {setsQuery.isSuccess && sets.length > 0 && visible.length === 0 && (
            <p className="py-16 text-center text-sm text-muted">No lots in this list yet.</p>
          )}

          {visible.length > 0 && (
            <div className="space-y-8">
              {groups.map(([category, lots]) => (
                <section key={category || "all"}>
                  {grouped ? (
                    <div className="mb-3 flex items-end justify-between gap-3">
                      <h2 className="font-display text-[20px] leading-tight font-extrabold tracking-tight text-navy">
                        {category}
                      </h2>
                      <p className="text-sm text-muted tabular-nums">{lots.length}</p>
                    </div>
                  ) : null}
                  {layout === "list" ? (
                    <ul className="overflow-hidden rounded-md bg-surface shadow-[var(--shadow-border)]">
                      {lots.map((s) => (
                        <li key={s.id} className="border-b border-border last:border-b-0">
                          <SetListRow set={s} onOpen={() => setSelectedId(s.id)} />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                      {lots.map((s) => (
                        <li key={s.id}>
                          <SetCard set={s} onOpen={() => setSelectedId(s.id)} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
        </>
        )}
      </main>


      <SetDetail set={selected} onClose={() => setSelectedId(null)} />
    </div>
  );
}

function SetCard({
  set,
  onOpen,
}: {
  set: LegoSet;
  onOpen: () => void;
}) {
  const code = conditionCode(set.condition);
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-md bg-surface shadow-[var(--shadow-border)] transition-[box-shadow] duration-150 ease-[var(--ease-smooth-out)] hover:shadow-[var(--shadow-border-hover)]">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col text-left"
      >
      <div className="relative aspect-square overflow-hidden bg-white">
        {set.imageUrl ? (
          <img
            src={set.imageUrl}
            alt={set.name}
            className="size-full object-contain p-[10px] outline outline-1 -outline-offset-1 outline-fg/10"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-subtle">
            <Boxes className="size-8" />
          </div>
        )}
        <div className="absolute top-2 left-2">
          <Badge variant={statusBadgeVariant(set.status)}>{statusLabel(set.status)}</Badge>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 border-t border-border p-3">
        <p className="font-mono text-xs font-medium text-link">{itemNumberDisplay(set.setNum, set.itemType)}</p>
        <p className="font-mono text-[11px] text-subtle">{set.sku}</p>
        <h2 className="line-clamp-2 text-base leading-snug font-semibold">{set.name}</h2>
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
          <Badge variant="default">{itemTypeLabel(set.itemType)}</Badge>
          <Badge variant={code === "N" ? "new" : "used"}>{code}</Badge>
          {set.ebayListed ? <ChannelMark channel="ebay" height={12} /> : null}
          {set.blListed ? <ChannelMark channel="bricklink" height={12} /> : null}
          {set.location ? <Badge variant="location">{set.location}</Badge> : null}
        </div>
        <p className="truncate text-xs text-muted">
          {[conditionLabel(set.condition), set.year, set.category, set.subCategory]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="font-display text-xl font-extrabold tracking-tight tabular-nums">
          {formatMoney(set.askingPrice ?? set.usedPrice, set.currency)}
        </p>
      </div>
      </button>
    </article>
  );
}

function SetListRow({
  set,
  onOpen,
}: {
  set: LegoSet;
  onOpen: () => void;
}) {
  const code = conditionCode(set.condition);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full min-w-0 items-start gap-3 px-3 py-2.5 text-left hover:bg-surface-2"
    >
      <span className="size-[60px] shrink-0 overflow-hidden rounded-sm bg-white outline outline-1 -outline-offset-1 outline-fg/10">
        {set.imageUrl ? (
          <img src={set.imageUrl} alt="" className="size-full object-contain p-1" />
        ) : (
          <span className="flex size-full items-center justify-center text-subtle">
            <Boxes className="size-5" />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1 pt-0.5">
        <span className="block line-clamp-2 break-words font-semibold leading-snug">{set.name}</span>
        <span className="mt-0.5 block font-mono text-[11px] text-subtle">
          {[itemNumberDisplay(set.setNum, set.itemType), set.sku].filter(Boolean).join(" · ")}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1">
          <Badge variant={statusBadgeVariant(set.status)}>{statusLabel(set.status)}</Badge>
          <Badge variant="default">{itemTypeLabel(set.itemType)}</Badge>
          <Badge variant={code === "N" ? "new" : "used"}>{code}</Badge>
          {set.ebayListed ? <ChannelMark channel="ebay" height={12} /> : null}
          {set.blListed ? <ChannelMark channel="bricklink" height={12} /> : null}
          {set.location ? <Badge variant="location">{set.location}</Badge> : null}
        </span>
      </span>
      <span className="shrink-0 font-display text-base font-extrabold tabular-nums">
        {formatMoney(set.askingPrice ?? set.usedPrice, set.currency)}
      </span>
    </button>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mt-1 rounded-md bg-surface px-6 py-16 text-center shadow-[var(--shadow-border)]">
      <GbBloxLogo className="mx-auto h-14 sm:h-16" />
      <h2 className="mt-4 font-display text-[26px] leading-[1.15] font-extrabold tracking-tight text-navy">
        No lots yet
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-[16px] leading-snug text-fg">
        Add a BrickLink item number for a set or minifigure, or import a CSV.
      </p>
      <Button className="mt-6" onClick={onAdd}>
        <Plus />
        Add your first item
      </Button>
    </div>
  );
}
