import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const MAX_PHOTOS = 6;

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Choose a photo file."));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const encode = (maxEdge: number) => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/png");
      };
      let data = encode(1200);
      if (!data) {
        reject(new Error("Could not read that photo."));
        return;
      }
      if (data.length > 1_800_000) data = encode(900) ?? data;
      if (data.length > 1_800_000) data = encode(700) ?? data;
      resolve(data);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that photo."));
    };
    img.src = url;
  });
}

export function ImagePicker({
  values,
  onChange,
  disabled,
  label = "Your photos",
}: {
  values: string[];
  onChange: (urls: string[]) => void;
  disabled?: boolean;
  label?: string | false;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewIndex, setViewIndex] = useState<number | null>(null);
  const canAdd = !disabled && values.length < MAX_PHOTOS;

  useEffect(() => {
    if (viewIndex == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewIndex(null);
      if (e.key === "ArrowLeft") setViewIndex((i) => (i == null ? i : (i + values.length - 1) % values.length));
      if (e.key === "ArrowRight") setViewIndex((i) => (i == null ? i : (i + 1) % values.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewIndex, values.length]);

  if (disabled && values.length === 0) return null;

  return (
    <div className="space-y-2">
      {label ? <Label>{label}</Label> : null}
      <div className="flex flex-wrap gap-2">
        {values.map((src, i) => (
          <div
            key={`${i}-${src.slice(0, 20)}`}
            className="relative size-20 overflow-hidden rounded-md bg-white outline outline-1 -outline-offset-1 outline-fg/10"
          >
            <button
              type="button"
              className="size-full"
              onClick={() => setViewIndex(i)}
              aria-label={`View photo ${i + 1}`}
            >
              <img src={src} alt="" className="size-full object-contain p-1" />
            </button>
            {!disabled ? (
              <button
                type="button"
                className="absolute top-0.5 right-0.5 rounded-sm bg-surface/90 p-1 text-danger shadow-[var(--shadow-border-line)]"
                aria-label="Remove photo"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(values.filter((_, idx) => idx !== i));
                }}
              >
                <Trash2 className="size-3" />
              </button>
            ) : null}
          </div>
        ))}
        {!disabled && (canAdd || busy) ? (
          <button
            type="button"
            disabled={disabled || busy || !canAdd}
            onClick={() => inputRef.current?.click()}
            className="flex size-20 shrink-0 items-center justify-center rounded-md bg-white text-subtle outline outline-1 -outline-offset-1 outline-fg/10 hover:outline-link disabled:hover:outline-fg/10"
            aria-label="Add photo"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-6" />}
          </button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        disabled={!canAdd}
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (!files.length) return;
          setBusy(true);
          setError(null);
          try {
            const room = MAX_PHOTOS - values.length;
            const next = [...values];
            for (const file of files.slice(0, room)) next.push(await compressImage(file));
            onChange(next);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not add photo");
          } finally {
            setBusy(false);
          }
        }}
      />
      {!disabled ? (
        <>
          <Button type="button" variant="outline" size="sm" disabled={!canAdd || busy} onClick={() => inputRef.current?.click()}>
            <ImagePlus />
            Add photos
          </Button>
          <p className="text-xs text-subtle">Extra shots of this lot. The BrickLink catalog image stays as it is.</p>
        </>
      ) : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}

      {viewIndex != null && values[viewIndex] ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-navy/80 p-4"
          onClick={() => setViewIndex(null)}
        >
          <button
            type="button"
            className="absolute top-3 right-3 rounded-md bg-surface p-2 text-fg"
            aria-label="Close photo"
            onClick={() => setViewIndex(null)}
          >
            <X className="size-5" />
          </button>
          {values.length > 1 ? (
            <button
              type="button"
              className="absolute left-3 rounded-md bg-surface p-2 text-fg"
              aria-label="Previous photo"
              onClick={(e) => {
                e.stopPropagation();
                setViewIndex((viewIndex + values.length - 1) % values.length);
              }}
            >
              <ChevronLeft className="size-5" />
            </button>
          ) : null}
          {values.length > 1 ? (
            <button
              type="button"
              className="absolute right-3 rounded-md bg-surface p-2 text-fg"
              aria-label="Next photo"
              onClick={(e) => {
                e.stopPropagation();
                setViewIndex((viewIndex + 1) % values.length);
              }}
            >
              <ChevronRight className="size-5" />
            </button>
          ) : null}
          <img
            src={values[viewIndex]}
            alt=""
            className="max-h-[90vh] max-w-[90vw] rounded-md bg-white object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}
