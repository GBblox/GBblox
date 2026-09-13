import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { parseLocations } from "./locations";
import type { SellerSettings } from "./types";

const DEFAULTS: SellerSettings = {
  rebrickableApiKey: "",
  ebayClientId: "",
  ebayClientSecret: "",
  ebayUserToken: "",
  blConsumerKey: "",
  blConsumerSecret: "",
  blToken: "",
  blTokenSecret: "",
  marketplace: "EBAY_GB",
  postalCode: "",
  city: "",
  shippingCost: "0",
  handlingDays: "1",
  locations: [],
  royalMailApiKey: "",
  royalMailSenderName: "",
};

type SettingsState = SellerSettings & {
  setSettings: (patch: Partial<SellerSettings>) => void;
};

export const useSellerSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setSettings: (patch) =>
        set((s) => ({
          ...patch,
          locations: patch.locations === undefined ? s.locations : parseLocations(patch.locations),
        })),
    }),
    {
      name: "brickshelf-settings",
      skipHydration: true,
      version: 5,
      migrate: (persisted) => {
        const p = (persisted ?? {}) as Partial<SellerSettings>;
        return {
          ...DEFAULTS,
          ...p,
          marketplace: "EBAY_GB",
          locations: parseLocations(p.locations),
          blConsumerKey: p.blConsumerKey?.trim() || DEFAULTS.blConsumerKey,
          blConsumerSecret: p.blConsumerSecret?.trim() || DEFAULTS.blConsumerSecret,
          blToken: p.blToken?.trim() || DEFAULTS.blToken,
          blTokenSecret: p.blTokenSecret?.trim() || DEFAULTS.blTokenSecret,
          royalMailApiKey: p.royalMailApiKey?.trim() || DEFAULTS.royalMailApiKey,
          royalMailSenderName: p.royalMailSenderName ?? DEFAULTS.royalMailSenderName,
        };
      },
      partialize: (s) => ({
        rebrickableApiKey: s.rebrickableApiKey,
        ebayClientId: s.ebayClientId,
        ebayClientSecret: s.ebayClientSecret,
        ebayUserToken: s.ebayUserToken,
        blConsumerKey: s.blConsumerKey,
        blConsumerSecret: s.blConsumerSecret,
        blToken: s.blToken,
        blTokenSecret: s.blTokenSecret,
        marketplace: s.marketplace,
        postalCode: s.postalCode,
        city: s.city,
        shippingCost: s.shippingCost,
        handlingDays: s.handlingDays,
        locations: parseLocations(s.locations),
        royalMailApiKey: s.royalMailApiKey,
        royalMailSenderName: s.royalMailSenderName,
      }),
    },
  ),
);

let rehydrated = false;
export function rehydrateSettings(): void {
  if (rehydrated || typeof window === "undefined") return;
  rehydrated = true;
  void useSellerSettings.persist.rehydrate();
}

export function useSettings(): SellerSettings & { setSettings: SettingsState["setSettings"] } {
  return useSellerSettings(
    useShallow((s) => ({
      rebrickableApiKey: s.rebrickableApiKey,
      ebayClientId: s.ebayClientId,
      ebayClientSecret: s.ebayClientSecret,
      ebayUserToken: s.ebayUserToken,
      blConsumerKey: s.blConsumerKey,
      blConsumerSecret: s.blConsumerSecret,
      blToken: s.blToken,
      blTokenSecret: s.blTokenSecret,
      marketplace: s.marketplace,
      postalCode: s.postalCode,
      city: s.city,
      shippingCost: s.shippingCost,
      handlingDays: s.handlingDays,
      locations: s.locations,
      royalMailApiKey: s.royalMailApiKey,
      royalMailSenderName: s.royalMailSenderName,
      setSettings: s.setSettings,
    })),
  );
}

export function ebayIsConnected(s: SellerSettings): boolean {
  return Boolean(s.ebayUserToken.trim() || (s.ebayClientId.trim() && s.ebayClientSecret.trim()));
}

export function ebayCanPublish(s: SellerSettings): boolean {
  return Boolean(s.ebayUserToken.trim());
}

export function bricklinkCanSync(s: SellerSettings): boolean {
  return Boolean(
    s.blConsumerKey.trim() &&
      s.blConsumerSecret.trim() &&
      s.blToken.trim() &&
      s.blTokenSecret.trim(),
  );
}

export function royalMailCanPost(s: SellerSettings): boolean {
  return Boolean(s.royalMailApiKey.trim());
}

export function credentialsOf(s: SellerSettings): SellerSettings {
  return {
    rebrickableApiKey: s.rebrickableApiKey,
    ebayClientId: s.ebayClientId,
    ebayClientSecret: s.ebayClientSecret,
    ebayUserToken: s.ebayUserToken,
    blConsumerKey: s.blConsumerKey,
    blConsumerSecret: s.blConsumerSecret,
    blToken: s.blToken,
    blTokenSecret: s.blTokenSecret,
    marketplace: "EBAY_GB",
    postalCode: s.postalCode,
    city: s.city,
    shippingCost: s.shippingCost,
    handlingDays: s.handlingDays,
    royalMailApiKey: s.royalMailApiKey,
    royalMailSenderName: s.royalMailSenderName,
  };
}