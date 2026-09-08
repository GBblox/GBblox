import { Camera, CameraOff, ClipboardList, FileDown, MapPin, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exactSkuMatch, isLocationCode, knownLocations, normalizeScan } from "@/lib/enquiry";
import { itemNumberDisplay, itemTypeLabel } from "@/lib/format";
import { useSettings } from "@/lib/settings";
import type { LegoSet } from "@/lib/types";
import { shelfBucket } from "@/lib/types";

const STORE_FULL = "gbblox-stocktake-full";
const STORE_LOCS = "gbblox-stocktake-locations";
const STORE_UI = "gbblox-stocktake-ui";
const STORE_LEGACY = "gbblox-stocktake";

type Detector = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

function barcodeDetector(): Detector | null {
  const Ctor = (window as unknown as { BarcodeDetector?: new (opts?: { formats?: string[] }) => Detector })
    .BarcodeDetector;
  if (!Ctor) return null;
  try {
    return new Ctor({ formats: ["code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "qr_code"] });
  } catch {
    return new Ctor();
  }
}

type Tab = "missing" | "counted" | "wrong" | "extra" | "report";

type Stocktake = {
  counted: number[];
  extra: string[];
  wrong: number[];
};

function emptyStock(): Stocktake {
  return { counted: [], extra: [], wrong: [] };
}

function parseStock(raw: string | null): Stocktake {
  if (!raw) return emptyStock();
  try {
    const parsed = JSON.parse(raw) as Stocktake;
    return {
      counted: Array.isArray(parsed.counted) ? parsed.counted.filter((n) => Number.isInteger(n)) : [],
      extra: Array.isArray(parsed.extra) ? parsed.extra.filter((s) => typeof s === "string") : [],
      wrong: Array.isArray(parsed.wrong) ? parsed.wrong.filter((n) => Number.isInteger(n)) : [],
    };
  } catch {
    return emptyStock();
  }
}

function locKey(name: string) {
  return name.trim().toLowerCase();
}

function sameLoc(a: string, b: string) {
  return locKey(a) === locKey(b);
}

function loadFullStock(): Stocktake {
  const current = sessionStorage.getItem(STORE_FULL);
  if (current) return parseStock(current);
  const legacy = sessionStorage.getItem(STORE_LEGACY);
  if (legacy) {
    const migrated = parseStock(legacy);
    sessionStorage.setItem(STORE_FULL, JSON.stringify(migrated));
    return migrated;
  }
  return emptyStock();
}

function loadLocMap(): Record<string, Stocktake> {
  try {
    const raw = sessionStorage.getItem(STORE_LOCS);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Stocktake>;
    const out: Record<string, Stocktake> = {};
    for (const [key, value] of Object.entries(parsed ?? {})) {
      out[key] = parseStock(JSON.stringify(value));
    }
    return out;
  } catch {
    return {};
  }
}

function loadUi(): { mode: "full" | "location"; location: string } {
  try {
    const raw = sessionStorage.getItem(STORE_UI);
    if (!raw) return { mode: "full", location: "" };
    const parsed = JSON.parse(raw) as { mode?: string; location?: string };
    return {
      mode: parsed.mode === "location" ? "location" : "full",
      location: typeof parsed.location === "string" ? parsed.location : "",
    };
  } catch {
    return { mode: "full", location: "" };
  }
}

function loadStocktake(): Stocktake {
  return loadFullStock();
}

function saveFull(data: Stocktake) {
  sessionStorage.setItem(STORE_FULL, JSON.stringify(data));
}

function saveLocMap(map: Record<string, Stocktake>) {
  sessionStorage.setItem(STORE_LOCS, JSON.stringify(map));
}

export function auditIssueCount(lots: LegoSet[]): number {
  return lots.filter((lot) => lot.status !== "sold").length;
}

function byType<T extends { itemType: string }>(lots: T[]) {
  return {
    set: lots.filter((l) => l.itemType === "set"),
    minifig: lots.filter((l) => l.itemType === "minifig"),
  };
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function discrepancyCsv(
  missing: LegoSet[],
  counted: LegoSet[],
  soldFound: LegoSet[],
  extra: string[],
  wrong: LegoSet[],
  scannedLocation: string,
): string {
  const header = ["status", "sku", "item_no", "name", "app_location", "scanned_location", "item_type", "notes"];
  const lines = [header.join(",")];
  const row = (status: string, lot: LegoSet, notes: string) =>
    [
      status,
      lot.sku,
      itemNumberDisplay(lot.setNum, lot.itemType),
      lot.name,
      lot.location,
      scannedLocation,
      itemTypeLabel(lot.itemType),
      notes,
    ]
      .map(csvEscape)
      .join(",");
  for (const lot of missing) lines.push(row("missing_from_shelf", lot, "In app, not scanned"));
  for (const lot of counted) lines.push(row("matched", lot, "Physical lot matches app"));
  for (const lot of wrong) {
    lines.push(
      row(
        "wrong_location",
        lot,
        `Scanned at ${scannedLocation || "this location"}; app has ${lot.location || "no location"}`,
      ),
    );
  }
  for (const lot of soldFound) lines.push(row("sold_but_on_shelf", lot, "App says sold, scanned on shelf"));
  for (const code of extra) {
    lines.push(
      ["not_in_app", code, "", "", "", scannedLocation, "", "Scanned barcode with no catalog SKU"].map(csvEscape).join(","),
    );
  }
  return lines.join("\n");
}

const ANY_LOC = "__all_loc__";

export function AuditPanel({
  lots,
  onOpen,
}: {
  lots: LegoSet[];
  onOpen: (lot: LegoSet) => void;
}) {
  const { locations } = useSettings();
  const initialUi = loadUi();
  const [tab, setTab] = useState<Tab>("missing");
  const [typeFilter, setTypeFilter] = useState<"all" | "set" | "minifig">("all");
  const [locationFilter, setLocationFilter] = useState(initialUi.location);
  const [q, setQ] = useState("");
  const [scanning, setScanning] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [locMap, setLocMap] = useState<Record<string, Stocktake>>(loadLocMap);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef(0);
  const lastScanRef = useRef({ value: "", at: 0 });

  const stock = locationFilter ? (locMap[locKey(locationFilter)] ?? emptyStock()) : emptyStock();

  const setStock = (updater: (prev: Stocktake) => Stocktake) => {
    if (!locationFilter) return;
    const key = locKey(locationFilter);
    setLocMap((prev) => ({ ...prev, [key]: updater(prev[key] ?? emptyStock()) }));
  };

  const places = useMemo(() => knownLocations(lots, locations ?? []), [lots, locations]);
  const expected = useMemo(
    () =>
      lots.filter((lot) => {
        if (shelfBucket(lot) === "sold" || shelfBucket(lot) === "incomplete") return false;
        if (!locationFilter) return false;
        return lot.location.trim().toLowerCase() === locKey(locationFilter);
      }),
    [lots, locationFilter],
  );
  const countedSet = useMemo(() => new Set(stock.counted), [stock.counted]);
  const countedLots = useMemo(
    () => expected.filter((lot) => countedSet.has(lot.id)),
    [expected, countedSet],
  );
  const missingLots = useMemo(
    () => expected.filter((lot) => !countedSet.has(lot.id)),
    [expected, countedSet],
  );
  const soldFound = useMemo(
    () =>
      lots.filter((lot) => {
        if (lot.status !== "sold" || !countedSet.has(lot.id)) return false;
        if (!locationFilter) return false;
        return sameLoc(lot.location, locationFilter);
      }),
    [lots, countedSet, locationFilter],
  );
  const wrongLots = useMemo(
    () => lots.filter((lot) => stock.wrong.includes(lot.id)),
    [lots, stock.wrong],
  );

  useEffect(() => {
    saveLocMap(locMap);
  }, [locMap]);

  useEffect(() => {
    sessionStorage.setItem(STORE_UI, JSON.stringify({ mode: "location", location: locationFilter }));
  }, [locationFilter]);

  useEffect(() => {
    inputRef.current?.focus();
    return () => stopScan();
  }, []);

  const markScan = (raw: string) => {
    const value = normalizeScan(raw);
    if (!value) return;
    if (!locationFilter) {
      toast.message("Pick a location first");
      return;
    }
    const now = Date.now();
    if (value === lastScanRef.current.value && now - lastScanRef.current.at < 1800) return;
    lastScanRef.current = { value, at: now };

    const hit = exactSkuMatch(lots, value);
    if (!hit && isLocationCode(lots, locations ?? [], value)) {
      setLocationFilter(value.trim());
      toast.success(`Location stocktake: ${value.trim()}`);
      setQ("");
      return;
    }
    if (hit) {
      if (shelfBucket(hit) === "incomplete") {
        toast.message(`${hit.sku} is incomplete — skipped`);
        setQ("");
        return;
      }
      const misplaced = Boolean(locationFilter && !sameLoc(hit.location, locationFilter));
      setStock((prev) => {
        if (misplaced) {
          if (prev.wrong.includes(hit.id)) return prev;
          return {
            ...prev,
            wrong: [...prev.wrong, hit.id],
            counted: prev.counted.filter((id) => id !== hit.id),
          };
        }
        if (prev.counted.includes(hit.id)) return prev;
        return { ...prev, counted: [...prev.counted, hit.id], wrong: prev.wrong.filter((id) => id !== hit.id) };
      });
      if (misplaced) {
        toast.error(`${hit.sku} is filed at ${hit.location.trim() || "no location"}`);
        setTab("wrong");
      } else if (countedSet.has(hit.id) || stock.wrong.includes(hit.id)) {
        toast.message(`${hit.sku} already counted`);
      } else if (hit.status === "sold") {
        toast.message(`${hit.sku} is marked sold in the app`);
        setTab("extra");
      } else {
        toast.success(`Matched ${hit.sku}`);
      }
      setQ("");
      return;
    }
    setStock((prev) => {
      const key = value.toUpperCase();
      if (prev.extra.some((s) => s.toUpperCase() === key)) return prev;
      return { ...prev, extra: [...prev.extra, value] };
    });
    toast.error(`Not in catalog: ${value}`);
    setTab("extra");
    setQ("");
  };

  const stopScan = () => {
    window.cancelAnimationFrame(loopRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  };

  const startScan = async () => {
    if (scanning) {
      stopScan();
      return;
    }
    const detector = barcodeDetector();
    if (!detector) {
      toast.message("Camera scanning needs Chrome or Edge. A USB scanner will type into the box.");
      inputRef.current?.focus();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("This browser cannot open the camera.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setScanning(true);
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      const tick = async () => {
        const node = videoRef.current;
        if (!node || node.readyState < 2) {
          loopRef.current = window.requestAnimationFrame(() => void tick());
          return;
        }
        try {
          const codes = await detector.detect(node);
          const value = codes.find((c) => c.rawValue)?.rawValue;
          if (value) markScan(value);
        } catch {
          // empty frame
        }
        loopRef.current = window.requestAnimationFrame(() => void tick());
      };
      loopRef.current = window.requestAnimationFrame(() => void tick());
    } catch (err) {
      stopScan();
      toast.error(err instanceof Error ? err.message : "Could not open the camera.");
      inputRef.current?.focus();
    }
  };

  const expectedTypes = byType(expected);
  const countedTypes = byType(countedLots);
  const missingTypes = byType(missingLots);

  const reset = () => {
    setStock(() => emptyStock());
    setTab("missing");
    toast.message("Location stocktake cleared");
  };

  const list =
    tab === "missing" ? missingLots : tab === "counted" ? countedLots : [];
  const visibleList = typeFilter === "all" ? list : list.filter((lot) => lot.itemType === typeFilter);
  const visibleSold = typeFilter === "all" ? soldFound : soldFound.filter((lot) => lot.itemType === typeFilter);

  return (
    <section>
      <h1 className="font-display text-[26px] leading-[1.15] font-extrabold tracking-tight text-navy">Audit</h1>
      <p className="mt-2 text-[16px] leading-snug text-fg">
        {locationFilter
          ? `Scan lots at ${locationFilter}. Flags SKUs the app has in a different bin.`
          : "Pick a location, then scan every lot in that bin."}
      </p>
      {locationFilter ? (
        <p className="mt-2 text-sm text-muted">
          Sets {countedTypes.set.length} of {expectedTypes.set.length} counted · Minifigures{" "}
          {countedTypes.minifig.length} of {expectedTypes.minifig.length} counted
          {stock.extra.length || soldFound.length
            ? ` · ${stock.extra.length + soldFound.length} extra`
            : ""}
        </p>
      ) : null}

      <form
        className="mt-5 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          markScan(q);
        }}
      >
        <Button type="button" variant={scanning ? "secondary" : "default"} className="h-12" onClick={() => void startScan()}>
          {scanning ? <CameraOff /> : <Camera />}
          {scanning ? "Stop camera" : "Scan barcode"}
        </Button>
        <Input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Scan or type SKU"
          className="h-12 font-mono text-base sm:flex-1"
          aria-label="Stocktake SKU"
          autoComplete="off"
        />
        <Select
          value={locationFilter || ANY_LOC}
          onValueChange={(v) => setLocationFilter(v === ANY_LOC ? "" : v)}
        >
          <SelectTrigger className="h-12 w-full font-mono sm:w-48" aria-label="Stocktake location">
            <MapPin className="size-4 text-muted" />
            <SelectValue placeholder="Pick location" />
          </SelectTrigger>
          <SelectContent>
            {places.map((loc) => (
              <SelectItem key={loc} value={loc}>
                {loc}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="danger"
          className="h-12"
          onClick={() => setConfirmReset(true)}
        >
          <RotateCcw />
          Reset count
        </Button>
      </form>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset stocktake?</DialogTitle>
            <DialogDescription>
              Matched lots and extra scans will be cleared. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                reset();
                setConfirmReset(false);
              }}
            >
              Reset count
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className={scanning ? "mt-3 overflow-hidden rounded-md bg-navy shadow-[var(--shadow-border)]" : "sr-only"}>
        <video ref={videoRef} className="mx-auto max-h-72 w-full bg-navy object-cover" playsInline muted />
        {scanning ? (
          <p className="px-3 py-2 text-center text-xs text-navy-fg/80">Keep scanning — camera stays on</p>
        ) : null}
      </div>

      <div className="mx-auto mt-4 grid w-full max-w-5xl grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {(
          [
            ["missing", "Not scanned", `${missingTypes.set.length} sets · ${missingTypes.minifig.length} minifigs`],
            ["counted", "Matched", `${countedTypes.set.length} sets · ${countedTypes.minifig.length} minifigs`],
            ["wrong", "Wrong location", `${wrongLots.length}`],
            ["extra", "Not in app", `${stock.extra.length + soldFound.length}`],
            ["report", "Report", "Discrepancies"],
          ] as const
        ).map(([id, title, sub]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex min-h-20 flex-col items-center justify-center rounded-md px-2 py-2 text-center shadow-[var(--shadow-border)] ${tab === id ? "bg-navy text-navy-fg" : "bg-surface text-fg"}`}
          >
            <span className="text-sm font-semibold leading-tight">{title}</span>
            <span className={`mt-1 text-xs leading-snug ${tab === id ? "text-navy-fg/80" : "text-muted"}`}>{sub}</span>
          </button>
        ))}
      </div>

      {tab !== "report" ? (
        <div className="mt-4 inline-flex w-fit overflow-hidden rounded-md shadow-[var(--shadow-border)]">
          <Button
            variant={typeFilter === "all" ? "secondary" : "ghost"}
            size="sm"
            type="button"
            className="rounded-none shadow-none"
            aria-pressed={typeFilter === "all"}
            onClick={() => setTypeFilter("all")}
          >
            All
          </Button>
          <Button
            variant={typeFilter === "set" ? "secondary" : "ghost"}
            size="sm"
            type="button"
            className="rounded-none shadow-none"
            aria-pressed={typeFilter === "set"}
            onClick={() => setTypeFilter("set")}
          >
            Sets
          </Button>
          <Button
            variant={typeFilter === "minifig" ? "secondary" : "ghost"}
            size="sm"
            type="button"
            className="rounded-none shadow-none"
            aria-pressed={typeFilter === "minifig"}
            onClick={() => setTypeFilter("minifig")}
          >
            Minifigures
          </Button>
        </div>
      ) : null}

      {!locationFilter ? (
        <p className="mt-8 text-center text-sm text-muted">Pick a location to start this stocktake.</p>
      ) : tab === "report" ? (
        <DiscrepancyReport
          scope={locationFilter || "Location"}
          expected={expected.length}
          missing={missingLots}
          counted={countedLots}
          soldFound={soldFound}
          extra={stock.extra}
          wrong={wrongLots}
          scannedLocation={locationFilter}
          onOpen={onOpen}
        />
      ) : tab === "wrong" ? (
        <ul className="mt-5 overflow-hidden rounded-md bg-surface shadow-[var(--shadow-border)]">
          {(typeFilter === "all" ? wrongLots : wrongLots.filter((l) => l.itemType === typeFilter)).length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-muted">No location mismatches.</li>
          ) : (
            (typeFilter === "all" ? wrongLots : wrongLots.filter((l) => l.itemType === typeFilter)).map((lot) => (
              <li key={lot.id} className="border-b border-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => onOpen(lot)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2"
                >
                  <LotThumb lot={lot} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{lot.name}</span>
                    <span className="font-mono text-xs text-muted">{lot.sku}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      <Badge variant="reserved">Scanned at {locationFilter || "this bin"}</Badge>
                      <Badge variant="sold">App: {lot.location.trim() || "no location"}</Badge>
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : tab === "extra" ? (
        <ul className="mt-5 overflow-hidden rounded-md bg-surface shadow-[var(--shadow-border)]">
          {visibleSold.length === 0 && (typeFilter !== "all" || stock.extra.length === 0) ? (
            <li className="px-3 py-8 text-center text-sm text-muted">No extra scans.</li>
          ) : null}
          {visibleSold.map((lot) => (
            <li key={lot.id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => onOpen(lot)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2"
              >
                <LotThumb lot={lot} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{lot.name}</span>
                  <span className="font-mono text-xs text-muted">{lot.sku}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    <Badge variant="sold">Sold in app</Badge>
                  </span>
                </span>
              </button>
            </li>
          ))}
          {typeFilter === "all"
            ? stock.extra.map((code) => (
            <li key={code} className="border-b border-border px-3 py-2.5 last:border-b-0">
              <p className="font-mono text-sm font-semibold">{code}</p>
              <p className="text-xs text-muted">Scanned on the shelf — no matching SKU</p>
            </li>
          ))
            : null}
        </ul>
      ) : visibleList.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted">
          {tab === "missing" ? "Every available lot has been scanned." : "Nothing counted yet."}
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {(["set", "minifig"] as const).map((kind) => {
            const rows = visibleList.filter((lot) => lot.itemType === kind);
            if (rows.length === 0) return null;
            return (
              <div key={kind}>
                <p className="mb-2 text-sm font-semibold">
                  {kind === "set" ? "Sets" : "Minifigures"} · {rows.length}
                </p>
                <ul className="overflow-hidden rounded-md bg-surface shadow-[var(--shadow-border)]">
                  {rows.map((lot) => (
                    <li key={lot.id} className="border-b border-border last:border-b-0">
                      <button
                        type="button"
                        onClick={() => onOpen(lot)}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2"
                      >
                        <LotThumb lot={lot} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{lot.name}</span>
                          <span className="font-mono text-xs text-muted">
                            {itemNumberDisplay(lot.setNum, lot.itemType)} · {lot.sku}
                            {lot.location ? ` · ${lot.location}` : ""}
                          </span>
                          <span className="mt-1 flex flex-wrap gap-1">
                            <Badge variant="default">{itemTypeLabel(lot.itemType)}</Badge>
                            {tab === "counted" ? (
                              <Badge variant="sale">Matched</Badge>
                            ) : (
                              <Badge variant="reserved">Not scanned</Badge>
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function LotThumb({ lot }: { lot: LegoSet }) {
  if (lot.imageUrl) {
    return <img src={lot.imageUrl} alt="" className="size-14 shrink-0 rounded-sm bg-white object-contain" />;
  }
  return (
    <span className="flex size-14 shrink-0 items-center justify-center rounded-sm bg-white text-subtle">
      <ClipboardList className="size-5" />
    </span>
  );
}

function DiscrepancyReport({
  scope,
  expected,
  missing,
  counted,
  soldFound,
  extra,
  wrong,
  scannedLocation,
  onOpen,
}: {
  expected: number;
  missing: LegoSet[];
  counted: LegoSet[];
  soldFound: LegoSet[];
  extra: string[];
  wrong: LegoSet[];
  scannedLocation: string;
  onOpen: (lot: LegoSet) => void;
  scope: string;
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvName, setCsvName] = useState("gbblox-audit.csv");
  const missingTypes = byType(missing);
  const countedTypes = byType(counted);
  const expectedSets = missingTypes.set.length + countedTypes.set.length;
  const expectedFigs = missingTypes.minifig.length + countedTypes.minifig.length;

  const byLocation = useMemo(() => {
    const map = new Map<string, LegoSet[]>();
    for (const lot of missing) {
      const key = lot.location.trim() || "No location";
      const arr = map.get(key);
      if (arr) arr.push(lot);
      else map.set(key, [lot]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [missing]);

  const variance = missing.length + extra.length + soldFound.length + wrong.length;
  const filename = `gbblox-${scope.replace(/[^\w-]+/g, "-").toLowerCase() || "audit"}-${new Date().toISOString().slice(0, 10)}.csv`;

  const openExport = async () => {
    const csv = discrepancyCsv(missing, counted, soldFound, extra, wrong, scannedLocation);
    setCsvText(csv);
    setCsvName(filename);
    const picker = (
      window as unknown as {
        showSaveFilePicker?: (opts: {
          suggestedName: string;
          types: { description: string; accept: Record<string, string[]> }[];
        }) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>;
      }
    ).showSaveFilePicker;
    if (typeof picker === "function") {
      try {
        const handle = await picker({
          suggestedName: filename,
          types: [{ description: "CSV", accept: { "text/csv": [".csv"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
        await writable.close();
        toast.success("Report saved");
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }
    setExportOpen(true);
  };

  const copyCsv = async () => {
    try {
      await navigator.clipboard.writeText(csvText);
      toast.success("CSV copied. Paste into Excel or a text file and save as .csv");
    } catch {
      toast.error("Could not copy. Select the text below and copy it.");
    }
  };

  return (
    <div className="mt-5 space-y-4">
      <p className="text-sm font-semibold">{scope} report</p>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <ReportStat label="Sets matched" value={`${countedTypes.set.length} / ${expectedSets}`} tone="ok" />
        <ReportStat label="Sets missing" value={missingTypes.set.length} tone="warn" />
        <ReportStat label="Minifigs matched" value={`${countedTypes.minifig.length} / ${expectedFigs}`} tone="ok" />
        <ReportStat label="Minifigs missing" value={missingTypes.minifig.length} tone="warn" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <ReportStat label="Expected lots" value={expected} />
        <ReportStat label="Wrong location" value={wrong.length} tone="bad" />
        <ReportStat label="Extra scans" value={extra.length + soldFound.length} tone="bad" />
      </div>
      <p className="text-sm text-muted">
        {variance === 0
          ? "No discrepancies — physical count matches the catalog."
          : `${variance} discrepanc${variance === 1 ? "y" : "ies"} to review.`}
      </p>
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => void openExport()}>
        <FileDown />
        Download report CSV
      </Button>
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Save {csvName}</DialogTitle>
            <DialogDescription>
              This preview cannot put a file on your computer. Copy the CSV and paste it into Excel or Notepad, then save as .csv.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3 flex gap-2">
            <Button type="button" onClick={() => void copyCsv()}>
              Copy CSV
            </Button>
            <Button type="button" variant="outline" onClick={() => setExportOpen(false)}>
              Close
            </Button>
          </div>
          <textarea
            readOnly
            value={csvText}
            className="mt-3 h-48 w-full rounded-md bg-surface-2 p-2 font-mono text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
        </DialogContent>
      </Dialog>
      {wrong.length > 0 ? (
        <div className="rounded-md bg-surface p-3 shadow-[var(--shadow-border)]">
          <p className="text-sm font-semibold">Wrong location</p>
          <p className="mt-1 text-xs text-muted">
            Scanned at {scannedLocation || "this bin"} but the app has a different location
          </p>
          <ul className="mt-2 space-y-1">
            {wrong.map((lot) => (
              <li key={lot.id}>
                <button type="button" className="text-left text-sm text-link" onClick={() => onOpen(lot)}>
                  <span className="font-mono">{lot.sku}</span> · {lot.name} · app {lot.location.trim() || "none"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {soldFound.length > 0 ? (
        <div className="rounded-md bg-surface p-3 shadow-[var(--shadow-border)]">
          <p className="text-sm font-semibold">Sold in app, found on shelf</p>
          <ul className="mt-2 space-y-1">
            {soldFound.map((lot) => (
              <li key={lot.id}>
                <button type="button" className="font-mono text-sm text-link" onClick={() => onOpen(lot)}>
                  {lot.sku} · {lot.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {extra.length > 0 ? (
        <div className="rounded-md bg-surface p-3 shadow-[var(--shadow-border)]">
          <p className="text-sm font-semibold">Scanned, not in catalog</p>
          <ul className="mt-2 space-y-1 font-mono text-sm">
            {extra.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {byLocation.length > 0 ? (
        <div className="rounded-md bg-surface p-3 shadow-[var(--shadow-border)]">
          <p className="text-sm font-semibold">Missing from shelf, by location</p>
          <ul className="mt-2 space-y-3">
            {byLocation.map(([loc, lots]) => (
              <li key={loc}>
                <p className="text-xs font-semibold text-muted">
                  {loc} · {lots.length}
                </p>
                <ul className="mt-1 space-y-1">
                  {lots.map((lot) => (
                    <li key={lot.id}>
                      <button type="button" className="text-left text-sm text-link" onClick={() => onOpen(lot)}>
                        <span className="font-mono">{lot.sku}</span> · {lot.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ReportStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "ok" | "warn" | "bad";
}) {
  const color =
    tone === "ok" ? "text-success" : tone === "warn" ? "text-warn" : tone === "bad" ? "text-danger" : "text-navy";
  return (
    <div className="rounded-md bg-surface p-3 shadow-[var(--shadow-border)]">
      <p className="text-xs font-semibold text-muted">{label}</p>
      <p className={`font-display text-2xl font-extrabold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
