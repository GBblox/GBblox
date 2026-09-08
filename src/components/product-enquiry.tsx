import { Camera, CameraOff, MapPin, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { exactSkuMatch, filterLots, knownLocations, runEnquiry } from "@/lib/enquiry";
import { formatMoney, itemNumberDisplay, itemTypeLabel, statusBadgeVariant, statusLabel } from "@/lib/format";
import { useSettings } from "@/lib/settings";
import type { LegoSet } from "@/lib/types";

const ANY = "__any__";

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

export function ProductEnquiry({
  lots,
  onBack,
  onOpen,
}: {
  lots: LegoSet[];
  onBack: () => void;
  onOpen: (lot: LegoSet) => void;
}) {
  const { locations } = useSettings();
  const [q, setQ] = useState("");
  const [location, setLocation] = useState("");
  const [scanning, setScanning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef(0);

  const places = useMemo(() => knownLocations(lots, locations ?? []), [lots, locations]);
  const typed = useMemo(() => runEnquiry(lots, q, locations ?? []), [lots, q, locations]);
  const results = useMemo(() => {
    if (location) return filterLots(lots, { location, query: q });
    return typed.lots;
  }, [lots, location, q, typed]);
  const headingLoc = location || (typed.mode === "location" ? typed.location : null);

  useEffect(() => {
    inputRef.current?.focus();
    return () => stopScan();
  }, []);

  const applyScan = (raw: string) => {
    const value = raw.replace(/[\r\n\t]/g, "").trim();
    if (!value) return;
    stopScan();
    const sku = exactSkuMatch(lots, value);
    if (sku) {
      setLocation("");
      setQ(value);
      onOpen(sku);
      return;
    }
    const hit = runEnquiry(lots, value, locations ?? []);
    if (hit.mode === "location") {
      setLocation(hit.location ?? value);
      setQ("");
      toast.success(
        hit.lots.length === 1 ? `1 lot at ${hit.location}` : `${hit.lots.length} lots at ${hit.location}`,
      );
      return;
    }
    setLocation("");
    setQ(value);
    inputRef.current?.focus();
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
          if (value) {
            applyScan(value);
            return;
          }
        } catch {
          // keep looping — some frames are empty
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

  const empty = !q.trim() && !location;

  return (
    <section>
      <h1 className="font-display text-[26px] leading-[1.15] font-extrabold tracking-tight text-navy">Product enquiry</h1>
      <p className="mt-2 text-[16px] leading-snug text-fg">Scan a barcode, search, or filter by location.</p>

      <form
        className="mt-5 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          const typed = runEnquiry(lots, q, locations ?? []);
          if (!location && typed.mode === "location") {
            setLocation(typed.location ?? q);
            setQ("");
            return;
          }
          const sku = exactSkuMatch(results, q) ?? exactSkuMatch(lots, q);
          if (sku) onOpen(sku);
          else if (results[0]) onOpen(results[0]);
        }}
      >
        <Button type="button" variant={scanning ? "secondary" : "default"} className="h-12" onClick={() => void startScan()}>
          {scanning ? <CameraOff /> : <Camera />}
          {scanning ? "Stop camera" : "Scan barcode"}
        </Button>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <Input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={location ? `Search in ${location}` : "SKU, location, item number, or name"}
            className="h-12 pl-9 font-mono text-base"
            aria-label="Product enquiry search"
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>
        <Select
          value={location || ANY}
          onValueChange={(v) => {
            setLocation(v === ANY ? "" : v);
            inputRef.current?.focus();
          }}
        >
          <SelectTrigger className="h-12 w-full font-mono sm:w-44" aria-label="Filter by location">
            <MapPin className="size-4 text-muted" />
            <SelectValue placeholder="Any location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>Any location</SelectItem>
            {places.map((loc) => (
              <SelectItem key={loc} value={loc}>
                {loc}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </form>

      <div className={scanning ? "mt-3 overflow-hidden rounded-md bg-navy shadow-[var(--shadow-border)]" : "sr-only"}>
        <video ref={videoRef} className="mx-auto max-h-72 w-full bg-navy object-cover" playsInline muted />
        {scanning ? (
          <p className="px-3 py-2 text-center text-xs text-navy-fg/80">Point at a SKU or location barcode</p>
        ) : null}
      </div>

      <div className="mt-5">
        {empty ? (
          <p className="py-12 text-center text-sm text-muted">
            Pick a location, scan a location barcode, or type a SKU.
          </p>
        ) : results.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted">
            {location ? `No lots at ${location}${q.trim() ? ` matching “${q.trim()}”` : ""}.` : `No lots match “${q.trim()}”.`}
          </p>
        ) : (
          <>
            {headingLoc ? (
              <p className="mb-2 text-sm font-semibold">
                {results.length} {results.length === 1 ? "lot" : "lots"} at{" "}
                <span className="font-mono">{headingLoc}</span>
              </p>
            ) : (
              <p className="mb-2 text-sm text-muted">{results.length} matches</p>
            )}
            <ul className="overflow-hidden rounded-md bg-surface shadow-[var(--shadow-border)]">
              {results.map((lot) => (
                <li key={lot.id} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => onOpen(lot)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-2"
                  >
                    {lot.imageUrl ? (
                      <img src={lot.imageUrl} alt="" className="size-14 shrink-0 rounded-sm bg-white object-contain" />
                    ) : (
                      <span className="flex size-14 shrink-0 items-center justify-center rounded-sm bg-white text-subtle">
                        <Search className="size-5" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{lot.name}</span>
                      <span className="mt-0.5 block font-mono text-[11px] text-subtle">
                        {[itemNumberDisplay(lot.setNum, lot.itemType), lot.sku].filter(Boolean).join(" · ")}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        <Badge variant="default">{itemTypeLabel(lot.itemType)}</Badge>
                        <Badge variant={statusBadgeVariant(lot.status)}>
                          {statusLabel(lot.status)}
                        </Badge>
                        {lot.location ? <Badge variant="location">{lot.location}</Badge> : null}
                      </span>
                    </span>
                    <span className="shrink-0 font-display text-base font-extrabold tabular-nums">
                      {formatMoney(lot.askingPrice ?? lot.usedPrice, lot.currency)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
