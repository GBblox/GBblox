import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
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
import {
  CSV_TEMPLATE,
  csvExportFilename,
  csvTemplateFilename,
  lotsToCsv,
  parseInventoryCsv,
  type CsvIssue,
  type CsvLotRow,
} from "@/lib/csv";
import { importCsv } from "@/lib/server/sets";
import { mergeLocationOptions } from "@/lib/locations";
import { useSettings } from "@/lib/settings";
import type { LegoSet } from "@/lib/types";

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function CsvDialog({ lots }: { lots: LegoSet[] }) {
  const qc = useQueryClient();
  const { locations, setSettings } = useSettings();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);
  const [rows, setRows] = useState<CsvLotRow[]>([]);
  const [issues, setIssues] = useState<CsvIssue[]>([]);
  const [raw, setRaw] = useState<string | null>(null);

  function resetFile() {
    setFilename(null);
    setRows([]);
    setIssues([]);
    setRaw(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onPick(file: File | undefined) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type && !file.type.includes("csv") && file.type !== "text/plain") {
      toast.error("Choose a .csv file");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      try {
        const parsed = parseInventoryCsv(text);
        setFilename(file.name);
        setRows(parsed.rows);
        setIssues(parsed.issues);
        setRaw(text);
      } catch (err) {
        resetFile();
        toast.error(err instanceof Error ? err.message : "Could not read CSV");
      }
    };
    reader.readAsText(file);
  }

  const upload = useMutation({
    mutationFn: () => {
      if (!raw) throw new Error("Choose a CSV file first.");
      return importCsv({ data: { csv: raw } });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["sets"] });
      const extras = rows.map((r) => r.location).filter(Boolean);
      if (extras.length) setSettings({ locations: mergeLocationOptions(locations ?? [], extras) });
      const parts = [
        res.added ? `${res.added} added` : null,
        res.updated ? `${res.updated} updated` : null,
        res.skipped ? `${res.skipped} skipped` : null,
      ].filter(Boolean);
      if (res.issues.length) {
        setIssues(res.issues);
        toast.message(parts.join(" · ") || "Import finished", {
          description: res.issues[0]?.message,
        });
      } else {
        toast.success(parts.join(" · ") || "Nothing to import");
        resetFile();
        setOpen(false);
      }
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Import failed"),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetFile();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" aria-label="CSV import">
          <FileSpreadsheet />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>CSV catalog</DialogTitle>
          <DialogDescription>
            Download the template, one row per lot. Leave SKU blank to auto-assign
            GBB-SET-0001. A matching SKU updates that lot.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            variant="secondary"
            onClick={() => downloadText(csvTemplateFilename(), CSV_TEMPLATE)}
          >
            <Download />
            Download template
          </Button>
          <Button
            variant="outline"
            disabled={lots.length === 0}
            onClick={() => downloadText(csvExportFilename(), lotsToCsv(lots))}
          >
            <Download />
            Download current lots
          </Button>
        </div>

        <div className="relative rounded-md bg-surface-2 p-4">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="absolute inset-4 z-10 cursor-pointer opacity-0"
            aria-label="Upload CSV"
            onChange={(e) => onPick(e.target.files?.[0])}
          />
          <div className="pointer-events-none flex w-full flex-col items-center gap-2 rounded-md border border-dashed border-border bg-surface px-4 py-8 text-center">
            <Upload className="size-6 text-link" />
            <span className="text-sm font-semibold">{filename ?? "Choose a CSV file"}</span>
            <span className="text-xs text-muted">Up to 400 lots · UTF-8</span>
          </div>
        </div>

        {rows.length > 0 && (
          <div className="overflow-hidden rounded-md bg-surface-2">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <p className="text-sm font-semibold">
                {rows.length} lot{rows.length === 1 ? "" : "s"} ready
              </p>
              {issues.length > 0 && (
                <p className="text-xs text-danger">{issues.length} row{issues.length === 1 ? "" : "s"} skipped</p>
              )}
            </div>
            <div className="max-h-48 overflow-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted">
                    <th className="px-3 py-2 font-semibold">SKU</th>
                    <th className="px-3 py-2 font-semibold">Location</th>
                    <th className="px-3 py-2 font-semibold">Set</th>
                    <th className="px-3 py-2 font-semibold">Name</th>
                    <th className="px-3 py-2 font-semibold">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 12).map((r) => (
                    <tr key={`${r.line}-${r.setNum}`} className="border-b border-border/60">
                      <td className="px-3 py-1.5 font-mono">{r.sku || "auto"}</td>
                      <td className="px-3 py-1.5 font-mono">{r.location || "—"}</td>
                      <td className="px-3 py-1.5 font-mono text-link">{r.setNum}</td>
                      <td className="max-w-[10rem] truncate px-3 py-1.5">{r.name || "—"}</td>
                      <td className="px-3 py-1.5 tabular-nums">{r.askingPrice ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 12 && (
              <p className="px-4 py-2 text-xs text-subtle">Showing first 12 of {rows.length}</p>
            )}
          </div>
        )}

        {issues.length > 0 && (
          <ul className="max-h-28 overflow-auto rounded-md bg-danger/10 px-4 py-2 text-xs text-danger">
            {issues.slice(0, 12).map((issue) => (
              <li key={`${issue.line}-${issue.message}`}>
                Line {issue.line}: {issue.message}
              </li>
            ))}
          </ul>
        )}

        <Button className="w-full" disabled={!raw || upload.isPending} onClick={() => upload.mutate()}>
          {upload.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
          Import {rows.length ? `${rows.length} lots` : "CSV"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
