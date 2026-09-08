import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { locationChoices } from "@/lib/locations";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

const NONE = "__none__";

export function LocationSelect({
  id,
  value,
  onChange,
  className,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  className?: string;
  disabled?: boolean;
}) {
  const { locations } = useSettings();
  const choices = locationChoices(locations ?? [], value);
  return (
    <Select
      value={value.trim() ? value : NONE}
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
