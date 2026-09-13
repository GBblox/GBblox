import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { locationChoices, locationVisibleFor, normalizeLocation } from "@/lib/locations";
import { useSettings } from "@/lib/settings";
import type { ItemType } from "@/lib/types";
import { cn } from "@/lib/utils";

const NONE = "__none__";

export function LocationSelect({
  id,
  value,
  onChange,
  className,
  disabled,
  itemType = "set",
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  className?: string;
  disabled?: boolean;
  itemType?: ItemType;
}) {
  const { locations } = useSettings();
  const choices = locationChoices(locations ?? [], value, itemType);
  const current = normalizeLocation(value);
  const allowed = Boolean(current) && locationVisibleFor(current, itemType);
  return (
    <Select
      value={allowed ? current : NONE}
      onValueChange={(v) => onChange(v === NONE ? "" : v)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={cn("font-mono", className)} data-readonly={disabled || undefined}>
        <SelectValue placeholder="No location" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No location</SelectItem>
        {choices.map((loc) => (
          <SelectItem key={loc} value={loc}>
            {loc}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
