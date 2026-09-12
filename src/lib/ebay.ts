import { clampTitle, conditionLabel, ebaySearchQuery, inclusionLabel, itemNumberDisplay, itemTypeLabel, marketplaceOf } from "./format";
import { formatSku } from "./sku";
import type { Condition, LegoSet, MarketplaceId, SaleOrder, SaleOrderDetail, SellerSettings } from "./types";

export type ListingDraft = {
  title: string;
  descriptionHtml: string;
  price: number | null;
  quantity: number;
  conditionId: number;
  categoryId: string;
  pictureUrl: string | null;
  sku: string;
  prelistUrl: string;
};

function packagingOf(set: LegoSet): string {
  if (set.condition === "new_sealed") return "Box";
  if (set.comesWithBox === "yes") return "Box";
  if (set.comesWithBox === "no") return "No Packaging";
  return "";
}

export function ebayItemSpecifics(set: LegoSet): [string, string][] {
  const num = itemNumberDisplay(set.setNum, set.itemType);
  const theme = (set.category || set.theme || "").trim();
  const sub = (set.subCategory || "").trim();
  const pairs: [string, string][] = [["Brand", "LEGO"]];

  if (set.itemType === "minifig") {
    pairs.push(["Type", "Minifigure"]);
    if (set.name.trim()) pairs.push(["Character", set.name.trim()]);
    if (theme) pairs.push(["Theme", theme]);
    if (num) pairs.push(["MPN", num]);
  } else {
    pairs.push(["Type", "Sets"]);
    if (theme) pairs.push(["Theme", theme]);
    if (sub && sub.toLowerCase() !== theme.toLowerCase()) pairs.push(["Subtheme", sub]);
    if (num) {
      pairs.push(["LEGO Set Number", num]);
      pairs.push(["MPN", num]);
    }
    if (set.numParts) pairs.push(["Number of Pieces", String(set.numParts)]);
    const pack = packagingOf(set);
    if (pack) pairs.push(["Packaging", pack]);
  }

  if (set.year) pairs.push(["Year Manufactured", String(set.year)]);
  if (set.comesWithInstructions === "yes") pairs.push(["Features", "Includes instructions"]);
  else if (set.comesWithInstructions === "no") pairs.push(["Features", "No instructions"]);

  const seen = new Set<string>();
  return pairs.filter(([name, value]) => {
    const key = name.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function itemSpecificsXml(set: LegoSet): string {
  const pairs = ebayItemSpecifics(set);
  return `<ItemSpecifics>${pairs
    .map(
      ([name, value]) =>
        `<NameValueList><Name>${escapeXml(name)}</Name><Value>${escapeXml(value)}</Value></NameValueList>`,
    )
    .join("")}</ItemSpecifics>`;
}

type StoreCat = { id: string; name: string };

async function listEbayStoreCategories(token: string): Promise<StoreCat[]> {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetStoreRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <CategoryStructureOnly>true</CategoryStructureOnly>
</GetStoreRequest>`;
  const res = await fetch("https://api.ebay.com/ws/api.dll", {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1395",
      "X-EBAY-API-CALL-NAME": "GetStore",
      "X-EBAY-API-SITEID": "3",
      "X-EBAY-API-IAF-TOKEN": token,
    },
    body: xml,
  });
  const body = await res.text();
  const out: StoreCat[] = [];
  const blocks = body.split(/<CustomCategory>/i).slice(1);
  for (const block of blocks) {
    const id = block.match(/<CategoryID>([^<]+)<\/CategoryID>/i)?.[1]?.trim();
    const name = block.match(/<Name>([^<]+)<\/Name>/i)?.[1]?.trim();
    if (id && name) out.push({ id, name });
  }
  return out;
}

function pickStoreCategory(cats: StoreCat[], set: LegoSet): StoreCat | null {
  const needles = [set.category, set.subCategory, set.theme, set.itemType === "minifig" ? "Minifigure" : "Set"]
    .map((s) => s?.trim().toLowerCase())
    .filter((s): s is string => Boolean(s));
  if (!needles.length || !cats.length) return null;
  const exact = cats.find((c) => needles.includes(c.name.toLowerCase()));
  if (exact) return exact;
  return (
    cats.find((c) => needles.some((n) => c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase()))) ?? null
  );
}

function storefrontXml(cat: StoreCat | null): string {
  if (!cat) return "";
  return `<Storefront><StoreCategoryID>${escapeXml(cat.id)}</StoreCategoryID></Storefront>`;
}

function conditionId(c: Condition): number {
  if (c === "new_sealed") return 1000;
  if (c === "new_opened") return 1500;
  if (c === "used_parts") return 7000;
  return 3000;
}

function conditionDescription(set: LegoSet): string {
  const bits = [conditionLabel(set.condition)];
  if (set.itemType !== "minifig") {
    bits.push(`Box: ${inclusionLabel(set.comesWithBox)}`);
    bits.push(`Instructions: ${inclusionLabel(set.comesWithInstructions)}`);
  }
  if (set.notes.trim()) bits.push(set.notes.trim());
  return bits.join(". ").slice(0, 1000);
}

function escapeXml(s: string): string {
  return s
    .replaceAll("&", "\u0026amp;")
    .replaceAll("<", "\u0026lt;")
    .replaceAll(">", "\u0026gt;")
    .replaceAll('"', "\u0026quot;")
    .replaceAll("'", "\u0026apos;");
}

function listingConditionCopy(set: LegoSet): string[] {
  switch (set.condition) {
    case "new_sealed":
      return ["This item is brand new and factory sealed."];
    case "new_opened":
      return ["This item is new and has been opened."];
    case "used_incomplete":
      return ["This item is pre-owned and incomplete."];
    case "used_parts":
      return ["This item is sold as parts only and is not a complete set."];
    default:
      return ["This item is pre-owned but in good working condition."];
  }
}

function listingPackagingCopy(set: LegoSet): string[] {
  if (set.itemType === "minifig") return [];
  if (set.condition === "new_sealed") {
    return ["Instructions included. Original packaging included."];
  }
  const bits: string[] = [];
  if (set.comesWithInstructions === "yes") bits.push("Instructions included");
  else if (set.comesWithInstructions === "no") bits.push("Instructions not included");
  if (set.comesWithBox === "yes") bits.push("Original packaging included");
  else if (set.comesWithBox === "no") bits.push("Original packaging not included");
  return bits.length ? [`${bits.join(". ")}.`] : [];
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "\u0026amp;")
    .replaceAll("<", "\u0026lt;")
    .replaceAll(">", "\u0026gt;")
    .replaceAll('"', "\u0026quot;");
}

export function composeListing(set: LegoSet, marketplace: MarketplaceId): ListingDraft {
  const num = itemNumberDisplay(set.setNum, set.itemType);
  const kind = set.itemType === "minifig" ? "Minifigure" : "";
  const title = clampTitle(
    `LEGO ${kind} ${num} ${set.name}${set.year ? ` (${set.year})` : ""} ${conditionLabel(set.condition)}`.replace(/\s+/g, " "),
  );
  const img = set.imageUrl
    ? `<p><img src="${escapeHtml(set.imageUrl)}" alt="${escapeHtml(set.name)}" /></p>`
    : "";
  const notes = set.notes.trim()
    ? `<p><b>Seller notes</b><br/>${escapeHtml(set.notes).replaceAll("\n", "<br/>")}</p>`
    : "";
  const yearLine = set.year
    ? `<p>Released in ${set.year} this LEGO ${escapeHtml(set.name)} is a great addition to any collection.</p>`
    : `<p>This LEGO ${escapeHtml(set.name)} is a great addition to any collection.</p>`;
  const conditionLines = listingConditionCopy(set).map((line) => `<p>${escapeHtml(line)}</p>`);
  const packLines = listingPackagingCopy(set).map((line) => `<p>${escapeHtml(line)}</p>`);
  const stickerLine =
    set.itemType === "set" && set.condition !== "used_parts"
      ? "<p>All Stickered pieces are present where applicable.</p>"
      : "";
  const descriptionHtml = [
    img,
    "<p>At GBblox we only sell <b>GENUINE LEGO</b> sets and minifigures.</p>",
    yearLine,
    ...conditionLines,
    ...packLines,
    stickerLine,
    notes,
  ]
    .filter(Boolean)
    .join("\n");

  const q = encodeURIComponent(ebaySearchQuery(set.setNum, set.name, set.itemType));
  const host = marketplace === "EBAY_GB" ? "https://www.ebay.co.uk" : "https://www.ebay.com";

  return {
    title,
    descriptionHtml,
    price: set.askingPrice,
    quantity: set.qty,
    conditionId: conditionId(set.condition),
    categoryId: set.itemType === "minifig" ? "19007" : "19006",
    pictureUrl: set.imageUrl,
    sku: set.sku || formatSku(set.setNum, set.itemType, set.id),
    prelistUrl: `${host}/sl/prelist/suggest?_nkw=${q}`,
  };
}

export function fileExchangeRow(set: LegoSet, settings: SellerSettings, draft: ListingDraft): string {
  const market = marketplaceOf(settings.marketplace);
  const headers = [
    "Action",
    "CategoryID",
    "Title",
    "Description",
    "ConditionID",
    "PicURL",
    "Quantity",
    "Format",
    "StartPrice",
    "Duration",
    "Location",
    "PostalCode",
    "ShippingType",
    "ShippingService-1:Option",
    "ShippingService-1:Cost",
    "ReturnsAcceptedOption",
    "RefundOption",
    "ReturnsWithinOption",
    "ShippingCostPaidByOption",
    "DispatchTimeMax",
    "Currency",
    "Country",
    "SKU",
    "C:Brand",
  ];
  const desc = draft.descriptionHtml.replaceAll('"', '""');
  const values = [
    "Add",
    draft.categoryId,
    `"${draft.title.replaceAll('"', '""')}"`,
    `"${desc}"`,
    String(draft.conditionId),
    draft.pictureUrl ?? "",
    String(draft.quantity),
    "FixedPrice",
    draft.price != null ? String(draft.price) : "",
    "GTC",
    settings.city || "Home",
    settings.postalCode,
    "Flat",
    market.id === "EBAY_GB" ? "UK_OtherCourier" : "USPSPriority",
    settings.shippingCost || "0",
    "ReturnsAccepted",
    "MoneyBack",
    "Days_30",
    "Buyer",
    settings.handlingDays || "1",
    market.currency,
    market.country,
    draft.sku,
    "LEGO",
  ];
  return `${headers.join(",")}\n${values.join(",")}\n`;
}

export async function publishToEbay(
  set: LegoSet,
  settings: SellerSettings,
  draft: ListingDraft,
): Promise<{ itemId: string; url: string }> {
  const token = settings.ebayUserToken.trim();
  if (!token) throw new Error("Add an eBay user token in Settings to publish.");
  if (draft.price == null || draft.price <= 0) {
    throw new Error("Set a price before listing.");
  }
  const market = marketplaceOf(settings.marketplace);
  const location = settings.city.trim() || "Home";
  const postal = settings.postalCode.trim();
  if (!postal) throw new Error("Add a postal code in Settings — eBay requires it.");

  const shipService =
    market.id === "EBAY_GB" ? "UK_OtherCourier" : market.id === "EBAY_DE" ? "DE_DHLPaket" : "USPSPriority";

  let storeCat: StoreCat | null = null;
  try {
    storeCat = pickStoreCategory(await listEbayStoreCategories(token), set);
  } catch {
    storeCat = null;
  }

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<AddFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_GB</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Item>
    <Title>${escapeXml(draft.title)}</Title>
    <Description><![CDATA[${draft.descriptionHtml}]]></Description>
    <PrimaryCategory><CategoryID>${draft.categoryId}</CategoryID></PrimaryCategory>
    ${itemSpecificsXml(set)}
    ${storefrontXml(storeCat)}
    <StartPrice>${draft.price.toFixed(2)}</StartPrice>
    <CategoryMappingAllowed>true</CategoryMappingAllowed>
    <ConditionID>${draft.conditionId}</ConditionID>
    <ConditionDescription>${escapeXml(conditionDescription(set))}</ConditionDescription>
    <Country>GB</Country>
    <Currency>GBP</Currency>
    <DispatchTimeMax>${Number(settings.handlingDays) || 1}</DispatchTimeMax>
    <ListingDuration>GTC</ListingDuration>
    <ListingType>FixedPriceItem</ListingType>
    <Location>${escapeXml(location)}</Location>
    <PostalCode>${escapeXml(postal)}</PostalCode>
    <Quantity>${draft.quantity}</Quantity>
    <SKU>${escapeXml(draft.sku)}</SKU>
    <InventoryTrackingMethod>SKU</InventoryTrackingMethod>
    ${draft.pictureUrl ? `<PictureDetails><PictureURL>${escapeXml(draft.pictureUrl)}</PictureURL></PictureDetails>` : ""}
    <ReturnPolicy>
      <ReturnsAcceptedOption>ReturnsAccepted</ReturnsAcceptedOption>
      <RefundOption>MoneyBack</RefundOption>
      <ReturnsWithinOption>Days_30</ReturnsWithinOption>
      <ShippingCostPaidByOption>Buyer</ShippingCostPaidByOption>
    </ReturnPolicy>
    <ShippingDetails>
      <ShippingType>Flat</ShippingType>
      <ShippingServiceOptions>
        <ShippingServicePriority>1</ShippingServicePriority>
        <ShippingService>${shipService}</ShippingService>
        <ShippingServiceCost>${Number(settings.shippingCost) || 0}</ShippingServiceCost>
      </ShippingServiceOptions>
    </ShippingDetails>
    <Site>UK</Site>
  </Item>
</AddFixedPriceItemRequest>`;

  const res = await fetch("https://api.ebay.com/ws/api.dll", {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1395",
      "X-EBAY-API-CALL-NAME": "AddFixedPriceItem",
      "X-EBAY-API-SITEID": "3",
      "X-EBAY-API-IAF-TOKEN": token,
    },
    body: xml,
  });
  const body = await res.text();
  const ack = body.match(/<Ack>([^<]+)<\/Ack>/)?.[1];
  const itemId = body.match(/<ItemID>([^<]+)<\/ItemID>/)?.[1];
  const short = body.match(/<ShortMessage>([^<]+)<\/ShortMessage>/)?.[1];
  const long = body.match(/<LongMessage>([^<]+)<\/LongMessage>/)?.[1];
  if (ack !== "Success" && ack !== "Warning") {
    throw new Error(long || short || `eBay rejected the listing (${res.status}).`);
  }
  if (!itemId) throw new Error("eBay did not return a listing id.");
  const host = "https://www.ebay.co.uk";
  return { itemId, url: `${host}/itm/${itemId}` };
}

export type EbaySkuHit = {
  listed: boolean;
  status: "listed" | "not_listed" | "ended" | "unknown";
  itemId: string | null;
  url: string | null;
  title: string | null;
};

function xmlTag(body: string, tag: string): string | null {
  const cdata = body.match(new RegExp(`<${tag}>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i"));
  if (cdata?.[1] != null) return cdata[1];
  const plain = body.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, "i"));
  return plain?.[1] ?? null;
}

function decodeXml(s: string | null): string | null {
  if (s == null) return null;
  return s
    .replaceAll("\u0026amp;", "&")
    .replaceAll("\u0026lt;", "<")
    .replaceAll("\u0026gt;", ">")
    .replaceAll("\u0026quot;", '"')
    .replaceAll("\u0026apos;", "'");
}

async function tradingCall(
  call: string,
  xml: string,
  token: string,
  siteId: string,
): Promise<string> {
  const res = await fetch("https://api.ebay.com/ws/api.dll", {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1395",
      "X-EBAY-API-CALL-NAME": call,
      "X-EBAY-API-SITEID": siteId,
      "X-EBAY-API-IAF-TOKEN": token,
    },
    body: xml,
  });
  return res.text();
}

function parseEbayHit(body: string, host: string): EbaySkuHit | null {
  const itemId = xmlTag(body, "ItemID");
  if (!itemId) return null;
  const listingStatus = (xmlTag(body, "ListingStatus") ?? "").toLowerCase();
  const url = decodeXml(xmlTag(body, "ViewItemURL")) ?? `${host}/itm/${itemId}`;
  const title = decodeXml(xmlTag(body, "Title"));
  const active = listingStatus === "active" || listingStatus === "";
  const ended = listingStatus === "completed" || listingStatus === "ended";
  return {
    listed: active && !ended,
    status: ended ? "ended" : active ? "listed" : "not_listed",
    itemId,
    url,
    title,
  };
}

export async function lookupEbayBySku(
  token: string,
  sku: string,
  siteId: string,
  marketplaceId: string,
): Promise<EbaySkuHit> {
  const host = marketplaceId === "EBAY_GB" ? "https://www.ebay.co.uk" : "https://www.ebay.com";
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <SKU>${escapeXml(sku)}</SKU>
</GetItemRequest>`;
  const body = await tradingCall("GetItem", xml, token, siteId);
  const ack = xmlTag(body, "Ack");
  if (ack === "Success" || ack === "Warning") {
    return parseEbayHit(body, host) ?? {
      listed: false,
      status: "not_listed",
      itemId: null,
      url: null,
      title: null,
    };
  }
  const long = decodeXml(xmlTag(body, "LongMessage")) ?? decodeXml(xmlTag(body, "ShortMessage")) ?? "";
  if (/token|auth|expired|401|invalid user/i.test(long)) {
    throw new Error(long || "eBay token was rejected.");
  }
  try {
    const map = await listActiveEbayBySku(token, siteId, marketplaceId);
    return (
      map.get(sku.trim().toUpperCase()) ?? {
        listed: false,
        status: "not_listed",
        itemId: null,
        url: null,
        title: null,
      }
    );
  } catch {
    return { listed: false, status: "not_listed", itemId: null, url: null, title: null };
  }
}

export async function listActiveEbayBySku(
  token: string,
  siteId: string,
  marketplaceId: string,
): Promise<Map<string, EbaySkuHit>> {
  const host = marketplaceId === "EBAY_GB" ? "https://www.ebay.co.uk" : "https://www.ebay.com";
  const out = new Map<string, EbaySkuHit>();
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && page <= 8) {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <ActiveList>
    <Include>true</Include>
    <Pagination>
      <EntriesPerPage>200</EntriesPerPage>
      <PageNumber>${page}</PageNumber>
    </Pagination>
  </ActiveList>
</GetMyeBaySellingRequest>`;
    const body = await tradingCall("GetMyeBaySelling", xml, token, siteId);
    const ack = xmlTag(body, "Ack");
    if (ack !== "Success" && ack !== "Warning") {
      const long = decodeXml(xmlTag(body, "LongMessage"));
      throw new Error(long || "eBay selling list failed.");
    }
    totalPages = Number(xmlTag(body, "TotalNumberOfPages") || "1") || 1;
    const itemBlocks = body.split(/<Item>/).slice(1);
    for (const block of itemBlocks) {
      const sku = xmlTag(block, "SKU");
      if (!sku) continue;
      const hit = parseEbayHit(`<Item>${block}`, host);
      if (hit) out.set(sku.trim().toUpperCase(), hit);
    }
    page += 1;
  }
  return out;
}

export async function listEbaySoldOrders(
  token: string,
  siteId: string,
  marketplace: MarketplaceId,
): Promise<SaleOrder[]> {
  const { parseEbayOrdersXml } = await import("./ebay-orders");
  const from = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const to = new Date().toISOString();
  const orders: SaleOrder[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= 5) {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetOrdersRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <OrderRole>Seller</OrderRole>
  <CreateTimeFrom>${from}</CreateTimeFrom>
  <CreateTimeTo>${to}</CreateTimeTo>
  <Pagination>
    <EntriesPerPage>100</EntriesPerPage>
    <PageNumber>${page}</PageNumber>
  </Pagination>
</GetOrdersRequest>`;
    const body = await tradingCall("GetOrders", xml, token, siteId);
    const ack = xmlTag(body, "Ack");
    if (ack !== "Success" && ack !== "Warning") {
      const long = decodeXml(xmlTag(body, "LongMessage")) ?? decodeXml(xmlTag(body, "ShortMessage"));
      throw new Error(long || "eBay GetOrders failed.");
    }
    orders.push(...parseEbayOrdersXml(body, marketplace));
    hasMore = (xmlTag(body, "HasMoreOrders") ?? "").toLowerCase() === "true";
    page += 1;
  }
  return orders;
}

export async function endEbayListing(
  token: string,
  siteId: string,
  opts: { sku?: string | null; itemId?: string | null },
): Promise<void> {
  const sku = opts.sku?.trim();
  const itemId = opts.itemId?.trim();
  if (!sku && !itemId) throw new Error("Need an eBay SKU or item id to end the listing.");

  const tryCall = async (call: string, xml: string) => {
    const body = await tradingCall(call, xml, token, siteId);
    const ack = xmlTag(body, "Ack");
    if (ack === "Success" || ack === "Warning") return;
    const long = decodeXml(xmlTag(body, "LongMessage")) ?? decodeXml(xmlTag(body, "ShortMessage")) ?? "";
    if (/already (been )?(closed|ended|completed)|does not exist|no longer available/i.test(long)) return;
    throw new Error(long || `eBay could not end listing (${call}).`);
  };

  if (sku) {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<EndFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <SKU>${escapeXml(sku)}</SKU>
  <EndingReason>NotAvailable</EndingReason>
</EndFixedPriceItemRequest>`;
    try {
      await tryCall("EndFixedPriceItem", xml);
      return;
    } catch (err) {
      if (!itemId) throw err;
    }
  }
  if (itemId) {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<EndItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <ItemID>${escapeXml(itemId)}</ItemID>
  <EndingReason>NotAvailable</EndingReason>
</EndItemRequest>`;
    await tryCall("EndItem", xml);
  }
}

export async function fetchEbayOrder(
  token: string,
  siteId: string,
  marketplace: MarketplaceId,
  orderId: string,
): Promise<SaleOrderDetail> {
  const { parseEbayOrderDetail } = await import("./ebay-orders");
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<GetOrdersRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <OrderIDArray>
    <OrderID>${escapeXml(orderId.trim())}</OrderID>
  </OrderIDArray>
  <DetailLevel>ReturnAll</DetailLevel>
</GetOrdersRequest>`;
  const body = await tradingCall("GetOrders", xml, token, siteId);
  const ack = xmlTag(body, "Ack");
  if (ack !== "Success" && ack !== "Warning") {
    const long = decodeXml(xmlTag(body, "LongMessage")) ?? decodeXml(xmlTag(body, "ShortMessage"));
    throw new Error(long || "eBay could not load that order.");
  }
  return parseEbayOrderDetail(body, marketplace);
}

