import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { INCLUSIONS, type Inclusion } from "@/lib/types";
import { cn } from "@/lib/utils";

export function InclusionSelect({
  id,
  value,
  onChange,
  className,
  disabled,
}: {
  id?: string;
  value: Inclusion;
  onChange: (next: Inclusion) => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Inclusion)} disabled={disabled}>
      <SelectTrigger id={id} className={cn(className)} data-readonly={disabled || undefined}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {INCLUSIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
