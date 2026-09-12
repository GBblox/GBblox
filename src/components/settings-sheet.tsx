import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, KeyRound, Loader2, MapPin, Plus, Settings, Store, Truck, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { UserButton } from "@/lib/auth/gates";
import { addLocationOption, removeLocationOption } from "@/lib/locations";
import { getEbayNotifyConfig, mintEbayNotifyToken, testBricklinkToken, testEbayToken, updateEbayNotifyConfig } from "@/lib/server/sets";
import { testRoyalMailKey } from "@/lib/server/postage";
import { bricklinkCanSync, royalMailCanPost, useSettings } from "@/lib/settings";
import type { Condition, Inclusion } from "@/lib/types";

type SettingsPage = "locations" | "marketplace" | "rebrickable" | "ebay" | "bricklink" | "royalmail";

const PAGES: { id: SettingsPage; title: string; blurb: string; icon: typeof MapPin }[] = [
  { id: "locations", title: "Locations", blurb: "Bins and shelves", icon: MapPin },
  { id: "marketplace", title: "Marketplace", blurb: "eBay site and postage", icon: Store },
  { id: "rebrickable", title: "Rebrickable", blurb: "Catalog API key", icon: KeyRound },
  { id: "ebay", title: "eBay API", blurb: "App ID and user token", icon: Store },
  { id: "bricklink", title: "BrickLink store", blurb: "Price guide and listing", icon: KeyRound },
  { id: "royalmail", title: "Royal Mail", blurb: "Click & Drop postage", icon: Truck },
];

export function SettingsSheet() {
  const settings = useSettings();
  const setSettings = settings.setSettings;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<SettingsPage | null>(null);
  const [locationDraft, setLocationDraft] = useState("");

  const test = useMutation({
    mutationFn: () =>
      testEbayToken({
        data: { token: settings.ebayUserToken, marketplace: settings.marketplace },
      }),
    onSuccess: (res) => toast.success(`Connected as ${res.userId}`),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Token failed"),
  });

  const notifyCfg = useQuery({
    queryKey: ["ebay-notify-config"],
    queryFn: () => getEbayNotifyConfig(),
    enabled: open && page === "ebay",
  });
  const saveNotify = useMutation({
    mutationFn: (payload: { token: string; endpoint: string }) => updateEbayNotifyConfig({ data: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ebay-notify-config"] });
      toast.success("Deletion endpoint token saved");
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not save token"),
  });
  const mintNotify = useMutation({
    mutationFn: () => mintEbayNotifyToken(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["ebay-notify-config"] });
      toast.success(`New ${res.token.length}-character token — paste it into the eBay portal`);
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : "Could not generate token"),
  });

  const testBl = useMutation({
    mutationFn: () =>
      testBricklinkToken({
        data: {
          blConsumerKey: settings.blConsumerKey,
          blConsumerSecret: settings.blConsumerSecret,
          blToken: settings.blToken,
          blTokenSecret: settings.blTokenSecret,
        },
      }),
    onSuccess: (res) => toast.success(`BrickLink connected · ${res.lots} set lots`),
    onError: (err) => toast.error(err instanceof Error ? err.message : "BrickLink failed"),
  });

  const testRm = useMutation({
    mutationFn: () => testRoyalMailKey({ data: { royalMailApiKey: settings.royalMailApiKey } }),
    onSuccess: (res) => toast.success(`Click & Drop connected · ${res.release}`),
    onError: (err) => toast.error(err instanceof Error ? err.message : "Royal Mail failed"),
  });

  const addLocation = () => {
    const result = addLocationOption(settings.locations ?? [], locationDraft);
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    setSettings({ locations: result.list });
    setLocationDraft("");
  };

  const removeLocation = (loc: string) => {
    setSettings({ locations: removeLocationOption(settings.locations ?? [], loc) });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setPage(null);
      }}
    >
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Settings">
          <Settings />
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{page ? PAGES.find((p) => p.id === page)?.title ?? "Settings" : "Settings"}</SheetTitle>
          <SheetDescription>
            {page
              ? PAGES.find((p) => p.id === page)?.blurb
              : "Pick a section. Printer setup stays in this browser. API keys are never stored in the database."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-5 pb-8">
          <div className="rounded-md bg-surface-2 px-3 py-2">
            <UserButton />
          </div>
          {page ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setPage(null)}>
              <ChevronLeft />
              All settings
            </Button>
          ) : null}

          {!page ? (
            <ul className="grid grid-cols-1 gap-2">
              {PAGES.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setPage(item.id)}
                      className="flex w-full items-center gap-3 rounded-md bg-surface px-3 py-3 text-left shadow-[var(--shadow-border)] hover:bg-surface-2"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-navy">
                        <Icon className="size-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{item.title}</span>
                        <span className="block text-xs text-muted">{item.blurb}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : page === "locations" ? (
          <section className="space-y-3">
            <p className="text-sm text-muted">
              Bins and shelves for the Location dropdown on each lot. Location labels print only this code.
            </p>
            {!(settings.locations ?? []).length ? (
              <p className="text-sm text-muted">None yet. Add A-12, BIN-03, SHELF B4…</p>
            ) : (
              <ul className="space-y-2">
                {(settings.locations ?? []).map((loc) => (
                  <li
                    key={loc}
                    className="flex items-center gap-2 rounded-md bg-surface px-3 py-1.5 shadow-[var(--shadow-border)]"
                  >
                    <span className="min-w-0 flex-1 font-mono text-sm">{loc}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-10 shrink-0 px-0"
                      aria-label={`Remove ${loc}`}
                      onClick={() => removeLocation(loc)}
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addLocation();
              }}
            >
              <Input
                id="new-location"
                value={locationDraft}
                onChange={(e) => setLocationDraft(e.target.value)}
                className="font-mono"
                placeholder="A-12"
                maxLength={40}
                aria-label="New location"
              />
              <Button type="submit" variant="secondary" className="shrink-0">
                <Plus />
                Add
              </Button>
            </form>
          </section>
          ) : page === "marketplace" ? (

          <section className="space-y-3">
            <div className="space-y-2">
              <Label>eBay site</Label>
              <p className="rounded-md bg-surface px-3 py-2 text-sm shadow-[var(--shadow-border)]">
                eBay UK · GBP · site 3
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={settings.city}
                  onChange={(e) => setSettings({ city: e.target.value })}
                  placeholder="Manchester"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="zip">Postal code</Label>
                <Input
                  id="zip"
                  value={settings.postalCode}
                  onChange={(e) => setSettings({ postalCode: e.target.value })}
                  placeholder="M1 1AE"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ship">Shipping cost</Label>
                <Input
                  id="ship"
                  value={settings.shippingCost}
                  onChange={(e) => setSettings({ shippingCost: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="handle">Handling days</Label>
                <Input
                  id="handle"
                  value={settings.handlingDays}
                  onChange={(e) => setSettings({ handlingDays: e.target.value })}
                  placeholder="1"
                />
              </div>
            </div>
          </section>
          ) : page === "rebrickable" ? (

          <section className="space-y-3">
            <p className="text-sm text-muted">
              Optional. A free key from rebrickable.com/api lets lookups hit their live API for brand-new sets. The daily catalog already covers the rest.
            </p>
            <div className="space-y-2">
              <Label htmlFor="rb">API key</Label>
              <Input
                id="rb"
                type="password"
                autoComplete="off"
                value={settings.rebrickableApiKey}
                onChange={(e) => setSettings({ rebrickableApiKey: e.target.value })}
                placeholder="Paste key"
              />
            </div>
          </section>
          ) : page === "ebay" ? (

          <section className="space-y-3">
            <p className="text-sm text-muted">
              Listings use the eBay UK Trading API (site 3, GBP, ebay.co.uk). App ID + Cert ID power used-price comps. A user token publishes listings.
            </p>
            <div className="space-y-2">
              <Label htmlFor="cid">App ID (Client ID)</Label>
              <Input
                id="cid"
                type="password"
                autoComplete="off"
                value={settings.ebayClientId}
                onChange={(e) => setSettings({ ebayClientId: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="csec">Cert ID (Client Secret)</Label>
              <Input
                id="csec"
                type="password"
                autoComplete="off"
                value={settings.ebayClientSecret}
                onChange={(e) => setSettings({ ebayClientSecret: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tok">User token</Label>
              <Input
                id="tok"
                type="password"
                autoComplete="off"
                value={settings.ebayUserToken}
                onChange={(e) => setSettings({ ebayUserToken: e.target.value })}
                placeholder="OAuth user access token"
              />
            </div>
            <Button
              variant="secondary"
              className="w-full"
              disabled={!settings.ebayUserToken.trim() || test.isPending}
              onClick={() => test.mutate()}
            >
              {test.isPending ? <Loader2 className="animate-spin" /> : <Check />}
              Test token
            </Button>
            <div className="space-y-2 rounded-md bg-surface p-3 shadow-[var(--shadow-border)]">
              <Label htmlFor="ebay-verify">Marketplace deletion verification token</Label>
              <p className="text-xs text-muted">eBay requires 32–80 characters. Generate one, save it, then paste the same value in the developer portal.</p>
              <Input
                id="ebay-verify"
                value={notifyCfg.data?.token ?? ""}
                readOnly
                className="font-mono text-xs"
              />
              <Input
                value={notifyCfg.data?.endpoint || "https://gbblox.co.uk/api/ebay/notifications"}
                readOnly
                className="font-mono text-xs"
                aria-label="Notification endpoint"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={mintNotify.isPending}
                  onClick={() => mintNotify.mutate()}
                >
                  {mintNotify.isPending ? <Loader2 className="animate-spin" /> : null}
                  Generate 64-character token
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!notifyCfg.data?.token || saveNotify.isPending}
                  onClick={() =>
                    saveNotify.mutate({
                      token: notifyCfg.data!.token,
                      endpoint: notifyCfg.data?.endpoint || "https://gbblox.co.uk/api/ebay/notifications",
                    })
                  }
                >
                  Save token
                </Button>
              </div>
            </div>
            <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-muted">
              <li>Create a UK production app at developer.ebay.com</li>
              <li>Copy App ID and Cert ID, then a User token with Trading scopes</li>
              <li>Set city and postal code on the Marketplace tile (eBay UK requires them)</li>
              <li>
                Account deletion: Event Notification, topic MARKETPLACE_ACCOUNT_DELETION,
                endpoint shown above, verification token generated above (32–80 characters)
              </li>
            </ol>
          </section>
          ) : page === "bricklink" ? (

          <section className="space-y-3">
            <p className="text-sm text-muted">
              Store API keys power the BrickLink price guide (new and used), match lots when Remarks equals SKU, and list a set with that SKU in Remarks.
            </p>
            <div className="space-y-2">
              <Label htmlFor="bl-ck">Consumer key</Label>
              <Input
                id="bl-ck"
                type="password"
                autoComplete="off"
                value={settings.blConsumerKey}
                onChange={(e) => setSettings({ blConsumerKey: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bl-cs">Consumer secret</Label>
              <Input
                id="bl-cs"
                type="password"
                autoComplete="off"
                value={settings.blConsumerSecret}
                onChange={(e) => setSettings({ blConsumerSecret: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bl-tok">Token</Label>
              <Input
                id="bl-tok"
                type="password"
                autoComplete="off"
                value={settings.blToken}
                onChange={(e) => setSettings({ blToken: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bl-ts">Token secret</Label>
              <Input
                id="bl-ts"
                type="password"
                autoComplete="off"
                value={settings.blTokenSecret}
                onChange={(e) => setSettings({ blTokenSecret: e.target.value })}
              />
            </div>
            <Button
              variant="secondary"
              className="w-full"
              disabled={!bricklinkCanSync(settings) || testBl.isPending}
              onClick={() => testBl.mutate()}
            >
              {testBl.isPending ? <Loader2 className="animate-spin" /> : <Check />}
              Test BrickLink
            </Button>
            <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-muted">
              <li>Open bricklink.com/v3/api.page and register an app</li>
              <li>Copy consumer key, consumer secret, token, and token secret</li>
              <li>When you list from GBblox, the unique SKU is written to the BrickLink Remarks field</li>
              <li>Match SKU reads store inventories and marks Listed only when Remarks equals the app SKU</li>
            </ol>
          </section>
          ) : page === "royalmail" ? (

          <section className="space-y-3">
            <p className="text-sm text-muted">
              UK Click & Drop API at api.parcel.royalmail.com. The authorisation key lives in your Click & Drop account under Settings → Integrations.
            </p>
            <div className="space-y-2">
              <Label htmlFor="rm-key">Click & Drop authorisation key</Label>
              <Input
                id="rm-key"
                type="password"
                autoComplete="off"
                value={settings.royalMailApiKey}
                onChange={(e) => setSettings({ royalMailApiKey: e.target.value })}
                placeholder="UUID from Click & Drop"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rm-sender">Default trading name</Label>
              <Input
                id="rm-sender"
                value={settings.royalMailSenderName}
                onChange={(e) => setSettings({ royalMailSenderName: e.target.value })}
                placeholder="Name printed as sender on labels"
              />
            </div>
            <Button
              variant="secondary"
              className="w-full"
              disabled={!royalMailCanPost(settings) || testRm.isPending}
              onClick={() => testRm.mutate()}
            >
              {testRm.isPending ? <Loader2 className="animate-spin" /> : <Check />}
              Test Click & Drop
            </Button>
            <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-muted">
              <li>Sign in at clickanddrop.royalmail.com with your UK business account</li>
              <li>Settings → Integrations → add an API integration and copy the authorisation key</li>
              <li>Set the default trading name there so the return address prints on labels</li>
              <li>Paste the key here, then create labels from a sale order</li>
            </ol>
          </section>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
