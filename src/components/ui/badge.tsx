import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-semibold tracking-wide",
  {
    variants: {
      variant: {
        default: "bg-surface-2 text-muted",
        sale: "bg-success text-surface",
        listed: "bg-link/15 text-link",
        sold: "bg-danger text-surface",
        reserved: "bg-warn/15 text-warn",
        new: "bg-primary text-primary-fg",
        used: "bg-navy text-navy-fg",
        ebay: "bg-link/15 text-link",
        bricklink: "bg-warn/15 text-warn",
        off: "bg-surface-2 text-subtle",
        location: "bg-[#ff2d87] text-white",
        "channel-listed": "bg-success text-surface",
        "channel-not-listed": "bg-danger text-surface",
        "channel-unchecked": "bg-[#e67e22] text-white",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant, className }))} {...props} />;
}
