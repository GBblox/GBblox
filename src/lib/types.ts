export const CONDITIONS = [
  { value: "used_complete", label: "Used · complete" },
  { value: "used_incomplete", label: "Used · incomplete" },
  { value: "used_parts", label: "Used · parts only" },
  { value: "new_sealed", label: "New · sealed" },
  { value: "new_opened", label: "New · opened" },
] as const;

export type Condition = (typeof CONDITIONS)[number]["value"];

export const INCLUSIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "na", label: "Not Applicable" },
] as const;

export type Inclusion = (typeof INCLUSIONS)[number]["value"];

export const STATUSES = [
  { value: "complete", label: "Complete" },
  { value: "incomplete", label: "Incomplete" },
  { value: "for_sale", label: "For sale" },
  { value: "listed", label: "Listed" },
  { value: "reserved", label: "Reserved" },
  { value: "sold", label: "Sold" },
] as const;

export type Status = (typeof STATUSES)[number]["value"];

export const ITEM_TYPES = [
  { value: "set", label: "Set" },
  { value: "minifig", label: "Minifigure" },
] as const;

export type ItemType = (typeof ITEM_TYPES)[number]["value"];

export type ShelfBucket = "complete" | "incomplete" | "sold" | "minifig";

export function shelfBucket(lot: { status: Status; itemType: ItemType; condition: Condition }): ShelfBucket {
  if (lot.status === "sold") return "sold";
  if (lot.itemType === "minifig") return "minifig";
  if (lot.status === "incomplete") return "incomplete";
  if (lot.status === "complete") return "complete";
  if (lot.condition === "used_incomplete" || lot.condition === "used_parts") return "incomplete";
  return "complete";
}

export const CHANNEL_STATUSES = ["listed", "not_listed", "ended", "unknown"] as const;
export type ChannelStatus = (typeof CHANNEL_STATUSES)[number];

export const MARKETPLACES = [
  { id: "EBAY_GB", label: "eBay UK", currency: "GBP", siteId: "3", country: "GB" },
  { id: "EBAY_US", label: "eBay US", currency: "USD", siteId: "0", country: "US" },
  { id: "EBAY_AU", label: "eBay AU", currency: "AUD", siteId: "15", country: "AU" },
  { id: "EBAY_CA", label: "eBay CA", currency: "CAD", siteId: "2", country: "CA" },
  { id: "EBAY_DE", label: "eBay DE", currency: "EUR", siteId: "77", country: "DE" },
] as const;

export type MarketplaceId = (typeof MARKETPLACES)[number]["id"];

export type LegoSet = {
  id: number;
  itemType: ItemType;
  setNum: string;
  sku: string;
  location: string;
  name: string;
  year: number | null;
  theme: string | null;
  themeId: number | null;
  category: string | null;
  subCategory: string | null;
  weightGrams: number | null;
  numParts: number | null;
  imageUrl: string | null;
  extraPhotos: string[];
  batchNumber: string;
  condition: Condition;
  comesWithInstructions: Inclusion;
  comesWithBox: Inclusion;
  qty: number;
  askingPrice: number | null;
  currency: string;
  usedPrice: number | null;
  usedPriceMin: number | null;
  usedPriceMax: number | null;
  usedPriceSource: string | null;
  usedPriceAt: string | null;
  newPrice: number | null;
  newPriceMin: number | null;
  newPriceMax: number | null;
  retailPrice: number | null;
  notes: string;
  status: Status;
  ebayItemId: string | null;
  ebayListingUrl: string | null;
  ebayTitle: string | null;
  ebayListed: boolean;
  ebayListingStatus: ChannelStatus;
  ebaySyncedAt: string | null;
  blListed: boolean;
  blInventoryId: string | null;
  blListingUrl: string | null;
  blListingStatus: ChannelStatus;
  blSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CatalogHit = {
  itemType: ItemType;
  setNum: string;
  name: string;
  year: number | null;
  theme: string | null;
  themeId: number | null;
  category: string | null;
  subCategory: string | null;
  weightGrams: number | null;
  numParts: number | null;
  imageUrl: string | null;
  rebrickableUrl: string;
  retailPrice: number | null;
};

export type MarketPrice = {
  used: number | null;
  usedMin: number | null;
  usedMax: number | null;
  usedCount: number;
  new: number | null;
  newMin: number | null;
  newMax: number | null;
  newCount: number;
  sampleCount: number;
  source: string | null;
  retail: number | null;
  currency: string;
  message: string | null;
  links: {
    rebrickable: string;
    bricklink: string;
    ebaySold: string;
  };
};

export type SellerSettings = {
  rebrickableApiKey: string;
  ebayClientId: string;
  ebayClientSecret: string;
  ebayUserToken: string;
  blConsumerKey: string;
  blConsumerSecret: string;
  blToken: string;
  blTokenSecret: string;
  marketplace: MarketplaceId;
  postalCode: string;
  city: string;
  shippingCost: string;
  handlingDays: string;
  locations?: string[];
  royalMailApiKey: string;
  royalMailSenderName: string;
};

export type SaleChannel = "ebay" | "bricklink";

export type SaleLine = {
  title: string;
  sku: string | null;
  itemNo: string | null;
  qty: number;
  price: number | null;
  itemKind?: string | null;
  condition?: string | null;
  color?: string | null;
  imageUrl?: string | null;
};

export type SaleOrder = {
  id: string;
  channel: SaleChannel;
  status: string;
  createdAt: string;
  buyer: string;
  total: number | null;
  currency: string;
  itemCount: number;
  items: SaleLine[];
  url: string;
  pulled: boolean;
};

export type SaleAddress = {
  name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postal: string;
  country: string;
};

export type SaleOrderDetail = SaleOrder & {
  email: string | null;
  phone: string | null;
  payment: string | null;
  shippingMethod: string | null;
  shippingCost: number | null;
  subtotal: number | null;
  remarks: string | null;
  address: SaleAddress | null;
  paidAt: string | null;
  shippedAt: string | null;
  postage: PostageLabel | null;
};

export type PostageLabel = {
  orderIdentifier: string;
  trackingNumber: string | null;
  serviceCode: string;
  labelPdf: string | null;
  createdAt: string | null;
};

export const BATCH_PLATFORMS = [
  { value: "gumtree", label: "Gumtree" },
  { value: "facebook", label: "Facebook Marketplace" },
  { value: "ebay", label: "eBay" },
] as const;
export type BatchPlatform = (typeof BATCH_PLATFORMS)[number]["value"];

export const BATCH_PAYMENTS = [
  { value: "cash", label: "Cash" },
  { value: "paypal", label: "PayPal" },
  { value: "stripe", label: "Stripe" },
  { value: "ebay_payments", label: "eBay Payments" },
] as const;
export type BatchPayment = (typeof BATCH_PAYMENTS)[number]["value"];

export type PurchaseBatch = {
  id: number;
  batchNumber: string;
  purchasedOn: string;
  platform: BatchPlatform;
  paymentMethod: BatchPayment;
  orderNumber: string;
  sellerName: string;
  sellerLine1: string;
  sellerLine2: string;
  sellerCity: string;
  sellerRegion: string;
  sellerPostal: string;
  sellerCountry: string;
  price: number | null;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

export type SalesResult = {
  orders: SaleOrder[];
  warnings: string[];
};
