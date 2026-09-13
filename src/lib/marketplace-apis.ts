import { useQuery } from "@tanstack/react-query";
import { getMarketplaceApiStatus } from "@/lib/server/marketplace-env";
import { bricklinkCanSync, ebayCanPublish, ebayIsConnected, royalMailCanPost, useSettings } from "@/lib/settings";

export function useMarketplaceApis() {
  const settings = useSettings();
  const q = useQuery({
    queryKey: ["marketplace-api-status"],
    queryFn: () => getMarketplaceApiStatus(),
    staleTime: 60_000,
  });
  const env = q.data;
  return {
    settings,
    env,
    rebrickable: Boolean(settings.rebrickableApiKey.trim() || env?.rebrickable),
    ebayApp: ebayIsConnected(settings) || Boolean(env?.ebayApp || env?.ebayUser),
    ebayPublish: ebayCanPublish(settings) || Boolean(env?.ebayUser),
    bricklink: bricklinkCanSync(settings) || Boolean(env?.bricklink),
    royalMail: royalMailCanPost(settings) || Boolean(env?.royalMail),
  };
}
