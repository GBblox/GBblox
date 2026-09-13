import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronLeft, ChevronUp, GripVertical, KeyRound, Loader2, MapPin, Plus, RefreshCw, Settings, Store, Truck, X } from "lucide-react";
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
import { addLocationOption, isMinifigLocation, moveLocationOption, removeLocationOption } from "@/lib/locations";
import { getEbayNotifyConfig, listEbayPolicies, mintEbayNotifyToken, testBricklinkToken, testEbayToken, updateEbayNotifyConfig } from "@/lib/server/sets";
import { testRoyalMailKey } from "@/lib/server/postage";
import { useMarketplaceApis } from "@/lib/marketplace-apis";
import { useSettings } from "@/lib/settings";
import type { Condition, Inclusion } from "@/lib/types";

type SettingsPage = "locations" | "marketplace" | "rebrickable" | "ebay" | "bricklink" | "royalmail";

const PAGES: { id: SettingsPage; title: string; blurb: string; icon: typeof MapPin }[] = [
  { id: "locations", title: "Locations", blurb: "Bins and shelves", icon: MapPin },
  { id: "marketplace", title: "Marketplace", blurb: "eBay site, postage and policies", icon: Store },
  { id: "rebrickable", title: "Rebrickable", blurb: "Catalog API key", icon: KeyRound },
  { id: "ebay", title: "eBay API", blurb: "App ID and user token", icon: Store },
  { id: "bricklink", title: "BrickLink store", blurb: "Price guide and listing", icon: KeyRound },
  { id: "royalmail", title: "Royal Mail", blurb: "Click & Drop (OLP)", icon: Truck },
];

export function SettingsSheet() {
  const settings = useSettings();
  const apis = useMarketplaceApis();
  const setSettings = settings.setSettings;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<SettingsPage | null>(null);
  const [locationDraft, setLocationDraft] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const test = useMutation({
    mutationFn: () =>
      testEbayToken({
        data: {
          token: settings.ebayUserToken,
          refreshToken: settings.ebayRefreshToken ?? "",
          clientId: settings.ebayClientId,
          clientSecret: settings.ebayClientSecret,
          marketplace: settings.marketplace,
        },
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
    if (!window.confirm(`Remove location ${loc}? Lots using it keep the code until you change them.`)) return;
    setSettings({ locations: removeLocationOption(settings.locations ?? [], loc) });
  };

  const moveLocation = (from: number, to: number) => {
    setSettings({ locations: moveLocationOption(settings.locations ?? [], from, to) });
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
              Bins and shelves for the Location dropdown on each lot. Codes starting with MF only appear on minifigures. Every other code only appears on sets. Drag or use the arrows to change order.
            </p>
            {!(settings.locations ?? []).length ? (
              <p className="text-sm text-muted">None yet. Add A-12, BIN-03, SHELF B4…</p>
            ) : (
              <ul className="space-y-2">
                {(settings.locations ?? []).map((loc, i, list) => (
                  <li
                    key={loc}
                    draggable
                    onDragStart={(e) => {
                      setDragIndex(i);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", String(i));
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = Number(e.dataTransfer.getData("text/plain"));
                      moveLocation(Number.isInteger(from) ? from : (dragIndex ?? i), i);
                      setDragIndex(null);
                    }}
                    onDragEnd={() => setDragIndex(null)}
                    className={`flex items-center gap-1 rounded-md bg-surface px-1.5 py-1 shadow-[var(--shadow-border)] ${
                      dragIndex === i ? "opacity-50" : ""
                    }`}
                  >
                    <span
                      className="flex size-10 shrink-0 cursor-grab items-center justify-center text-muted active:cursor-grabbing"
                      aria-hidden
                    >
                      <GripVertical className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 font-mono text-sm">{loc}</span>
                    <span className="shrink-0 rounded-sm bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted uppercase">
                      {isMinifigLocation(loc) ? "Minifig" : "Set"}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-10 shrink-0 px-0"
                      aria-label={`Move ${loc} up`}
                      disabled={i === 0}
                      onClick={() => moveLocation(i, i - 1)}
                    >
                      <ChevronUp />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="size-10 shrink-0 px-0"
                      aria-label={`Move ${loc} down`}
                      disabled={i === list.length - 1}
                      onClick={() => moveLocation(i, i + 1)}
                    >
                      <ChevronDown />
                    </Button>
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="ebay-premium">eBay premium (£)</Label>
              <Input
                id="ebay-premium"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={settings.ebayPremium ?? "0"}
                onChange={(e) => setSettings({ ebayPremium: e.target.value })}
              />
              <p className="text-xs text-muted">Added to every eBay listing price on the confirm table.</p>
            </div>
            <EbayPolicyPickers />
          </section>
          ) : page === "rebrickable" ? (

          <section className="space-y-3">
            <p className="text-sm text-muted">
              Optional. Set <span className="font-mono">REBRICKABLE_API_KEY</span> on Vercel. A value here is only used if that env var is empty. Lookups hit their live API for brand-new sets; the daily catalog covers the rest.
            </p>
            <EnvStatus set={apis.env?.rebrickable} names={["REBRICKABLE_API_KEY"]} />
            <div className="space-y-2">
              <Label htmlFor="rb">API key fallback</Label>
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
              Listings use the eBay UK Trading API (site 3, GBP, ebay.co.uk). IAF user access tokens expire about every 2 hours — set a refresh token so GBblox can mint a new one. On Vercel: <span className="font-mono">EBAY_CLIENT_ID</span>, <span className="font-mono">EBAY_CLIENT_SECRET</span>, <span className="font-mono">EBAY_REFRESH_TOKEN</span>. <span className="font-mono">EBAY_USER_TOKEN</span> is optional once the refresh token is set.
            </p>
            <EnvStatus set={apis.env?.ebayApp} names={["EBAY_CLIENT_ID", "EBAY_CLIENT_SECRET"]} />
            <EnvStatus set={apis.env?.ebayUser} names={["EBAY_REFRESH_TOKEN", "EBAY_USER_TOKEN"]} />
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
              <Label htmlFor="tok">User access token (IAF)</Label>
              <Input
                id="tok"
                type="password"
                autoComplete="off"
                value={settings.ebayUserToken}
                onChange={(e) => setSettings({ ebayUserToken: e.target.value })}
                placeholder="Expires ~2 hours"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rtok">Refresh token</Label>
              <Input
                id="rtok"
                type="password"
                autoComplete="off"
                value={settings.ebayRefreshToken ?? ""}
                onChange={(e) => setSettings({ ebayRefreshToken: e.target.value })}
                placeholder="Lasts ~18 months"
              />
              <p className="text-xs text-muted">
                From the eBay OAuth user-consent response. Prefer <span className="font-mono">EBAY_REFRESH_TOKEN</span> on Vercel so listing and sales keep working after the access token dies.
              </p>
            </div>
            <Button
              variant="secondary"
              className="w-full"
              disabled={!apis.ebayPublish || test.isPending}
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
              Set these on Vercel: <span className="font-mono">BRICKLINK_CONSUMER_KEY</span>, <span className="font-mono">BRICKLINK_CONSUMER_SECRET</span>, <span className="font-mono">BRICKLINK_TOKEN</span>, <span className="font-mono">BRICKLINK_TOKEN_SECRET</span>. They power the price guide, SKU match, and listing. Values here are only used if the env vars are empty.
            </p>
            <EnvStatus
              set={apis.env?.bricklink}
              names={["BRICKLINK_CONSUMER_KEY", "BRICKLINK_CONSUMER_SECRET", "BRICKLINK_TOKEN", "BRICKLINK_TOKEN_SECRET"]}
            />
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
              disabled={!apis.bricklink || testBl.isPending}
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
              Pay-as-you-go Click & Drop (OLP). Set <span className="font-mono">ROYAL_MAIL_API_KEY</span> on Vercel. Orders go to the Click & Drop app — labels are printed there, not in GBblox. A key here is only used if the env var is empty.
            </p>
            <EnvStatus set={apis.env?.royalMail} names={["ROYAL_MAIL_API_KEY"]} />
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
              disabled={!apis.royalMail || testRm.isPending}
              onClick={() => testRm.mutate()}
            >
              {testRm.isPending ? <Loader2 className="animate-spin" /> : <Check />}
              Test Click & Drop
            </Button>
            <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-muted">
              <li>
                Sign in at{" "}
                <a
                  href="https://business.parcel.royalmail.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-link underline"
                >
                  business.parcel.royalmail.com
                </a>
              </li>
              <li>Settings → Integrations → add Click & Drop API and copy the authorisation key</li>
              <li>Tick “Use shipping address for billing address” on that integration</li>
              <li>Add the key as ROYAL_MAIL_API_KEY on Vercel (or paste a fallback here) and Test Click & Drop</li>
              <li>From a sale, send the order to Click & Drop, then print the label in that app</li>
            </ol>
          </section>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function EnvStatus({ set, names }: { set?: boolean; names: string[] }) {
  return (
    <p className="rounded-md bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
      Vercel: {names.map((n) => (
        <span key={n} className="mr-1 font-mono text-fg">
          {n}
        </span>
      ))}
      {set ? " · set on this deployment" : " · not set yet"}
    </p>
  );
}

const NONE = "__none__";

function EbayPolicyPickers() {
  const settings = useSettings();
  const setSettings = settings.setSettings;
  const policies = useQuery({
    queryKey: ["ebay-policies"],
    queryFn: () => listEbayPolicies({ data: { token: settings.ebayUserToken } }),
  });

  function apply(kind: "payment" | "shipping" | "returns", id: string) {
    const list = kind === "payment" ? policies.data?.payment : kind === "shipping" ? policies.data?.shipping : policies.data?.returns;
    const hit = list?.find((p) => p.id === id);
    if (kind === "payment") {
      setSettings({ ebayPaymentPolicyId: id === NONE ? "" : id, ebayPaymentPolicyName: hit?.name ?? "" });
    } else if (kind === "shipping") {
      setSettings({ ebayShippingPolicyId: id === NONE ? "" : id, ebayShippingPolicyName: hit?.name ?? "" });
    } else {
      setSettings({ ebayReturnPolicyId: id === NONE ? "" : id, ebayReturnPolicyName: hit?.name ?? "" });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">eBay business policies</p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={policies.isFetching}
          onClick={() => policies.refetch()}
        >
          {policies.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Pull from eBay
        </Button>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        Loaded from your eBay UK account. Selected policies are applied when you list. Leave as None to use the GBblox fallback (14-day returns, flat postage).
      </p>
      {policies.error ? (
        <p className="text-xs text-danger">{policies.error instanceof Error ? policies.error.message : "Could not load policies."}</p>
      ) : null}
      <PolicySelect
        label="Payment"
        value={settings.ebayPaymentPolicyId ?? ""}
        options={policies.data?.payment ?? []}
        currentName={settings.ebayPaymentPolicyName}
        onChange={(id) => apply("payment", id)}
        loading={policies.isPending}
      />
      <PolicySelect
        label="Postage"
        value={settings.ebayShippingPolicyId ?? ""}
        options={policies.data?.shipping ?? []}
        currentName={settings.ebayShippingPolicyName}
        onChange={(id) => apply("shipping", id)}
        loading={policies.isPending}
      />
      <PolicySelect
        label="Return"
        value={settings.ebayReturnPolicyId ?? ""}
        options={policies.data?.returns ?? []}
        currentName={settings.ebayReturnPolicyName}
        onChange={(id) => apply("returns", id)}
        loading={policies.isPending}
      />
    </div>
  );
}

function PolicySelect({
  label,
  value,
  options,
  currentName,
  onChange,
  loading,
}: {
  label: string;
  value: string;
  options: { id: string; name: string; summary: string; isDefault: boolean }[];
  currentName?: string;
  onChange: (id: string) => void;
  loading: boolean;
}) {
  const missing = value && !options.some((p) => p.id === value);
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value || NONE} onValueChange={onChange} disabled={loading}>
        <SelectTrigger>
          <SelectValue placeholder={loading ? "Loading…" : `Select ${label.toLowerCase()} policy`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>None — GBblox fallback</SelectItem>
          {missing ? <SelectItem value={value}>{currentName || value}</SelectItem> : null}
          {options.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
              {p.isDefault ? " (default)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value && options.find((p) => p.id === value)?.summary ? (
        <p className="text-[11px] leading-relaxed text-subtle">{options.find((p) => p.id === value)?.summary}</p>
      ) : null}
    </div>
  );
}

