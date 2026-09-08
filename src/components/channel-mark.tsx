export function ChannelMark({
  channel,
  className = "",
  height = 16,
}: {
  channel: "ebay" | "bricklink";
  className?: string;
  height?: 12 | 16;
}) {
  const src = channel === "ebay" ? "/ebay-logo.png?v=2" : "/bricklink-logo.png?v=2";
  const alt = channel === "ebay" ? "eBay" : "BrickLink";
  return (
    <img
      src={src}
      alt={alt}
      title={alt}
      className={`${height === 12 ? "h-3" : "h-4"} inline-block w-auto max-w-[4.5rem] align-baseline object-contain object-left ${className}`}
    />
  );
}
