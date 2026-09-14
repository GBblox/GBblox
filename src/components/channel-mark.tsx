import { Badge } from "@/components/ui/badge";

export function ChannelMark({
  channel,
  className = "",
  height = 16,
}: {
  channel: "ebay" | "bricklink";
  className?: string;
  height?: 12 | 14 | 16;
}) {
  const src = channel === "ebay" ? "/ebay-logo.png?v=2" : "/bricklink-logo.png?v=2";
  const alt = channel === "ebay" ? "eBay" : "BrickLink";
  const hClass = height === 12 ? "h-3" : height === 14 ? "h-[14px]" : "h-4";
  return (
    <img
      src={src}
      alt={alt}
      title={alt}
      className={`${hClass} inline-block w-auto max-w-[4.5rem] align-baseline object-contain object-left ${className}`}
    />
  );
}

export function ListedOnRow({
  ebayListed,
  blListed,
  height = 16,
  className = "",
}: {
  ebayListed?: boolean;
  blListed?: boolean;
  height?: 12 | 14 | 16;
  className?: string;
}) {
  if (!ebayListed && !blListed) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`.trim()}>
      <Badge className="bg-[#ccff00] text-navy">Listed on</Badge>
      {ebayListed ? <ChannelMark channel="ebay" height={height} /> : null}
      {blListed ? <ChannelMark channel="bricklink" height={height} /> : null}
    </div>
  );
}
