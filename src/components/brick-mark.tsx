import { cn } from "@/lib/utils";

/** Full GBblox wordmark from the store logo. */
export function GbBloxLogo({ className }: { className?: string }) {
  return (
    <img
      src="/gbblox-logo.png"
      alt="GBblox"
      className={cn("h-9 w-auto select-none sm:h-10", className)}
    />
  );
}

/** Compact 1×2 brick mark for empty states. */
export function BrickMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 72 58" className={cn("h-10 w-auto shrink-0", className)} aria-hidden>
      <rect x="4" y="20" width="64" height="36" rx="4" fill="#122A6B" />
      <rect x="2" y="16" width="64" height="36" rx="4" fill="#1A3A8F" />
      <ellipse cx="20" cy="16" rx="11" ry="5" fill="#A81C1C" />
      <rect x="9" y="6" width="22" height="10" fill="#D32B2B" />
      <ellipse cx="20" cy="6" rx="11" ry="5" fill="#E24A3C" />
      <ellipse cx="52" cy="16" rx="11" ry="5" fill="#A81C1C" />
      <rect x="41" y="6" width="22" height="10" fill="#D32B2B" />
      <ellipse cx="52" cy="6" rx="11" ry="5" fill="#E24A3C" />
      <text
        x="34"
        y="42"
        textAnchor="middle"
        fill="#fff"
        fontFamily="Nunito, Arial Black, sans-serif"
        fontWeight="800"
        fontSize="22"
      >
        GB
      </text>
    </svg>
  );
}
