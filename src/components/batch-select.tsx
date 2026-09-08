import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listBatches } from "@/lib/server/batches";
import { cn } from "@/lib/utils";

export function BatchNumberSelect({
  value,
  onChange,
  disabled,
  className,
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const query = useQuery({
    queryKey: ["batches"],
    queryFn: () => listBatches(),
  });
  const batches = query.data ?? [];

  return (
    <Select
      value={value.trim() || "__none__"}
      onValueChange={(v) => onChange(v === "__none__" ? "" : v)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={cn("font-mono", className)} data-readonly={disabled || undefined}>
        <SelectValue placeholder="Select a batch" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">No batch</SelectItem>
        {batches.map((batch) => (
          <SelectItem key={batch.batchNumber} value={batch.batchNumber}>
            {batch.batchNumber}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function batchFieldHint(count: number | undefined, loading: boolean, error: boolean) {
  if (loading) return "Loading batches…";
  if (error) return "Could not load batches.";
  if (!count) return "Create a batch on the Batches tile first.";
  return "Choose the bulk buy this item was split from.";
}
