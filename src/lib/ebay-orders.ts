import type { MarketplaceId, SaleOrder, SaleOrderDetail } from "./types";

export function xmlBlocks(xml: string, tag: string): string[] {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  const out: string[] = [];
  let i = 0;
  while (i < xml.length) {
    const start = xml.indexOf(open, i);
    if (start === -1) break;
    const gt = xml.indexOf(">", start);
    if (gt === -1) break;
    const end = xml.indexOf(close, gt + 1);
    if (end === -1) break;
    out.push(xml.slice(gt + 1, end));
    i = end + close.length;
  }
  return out;
}

export function xmlText(block: string, tag: string): string | null {
  const cdata = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i"));
  if (cdata?.[1] != null) return cdata[1];
  const plain = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, "i"));
  return plain?.[1] ?? null;
}

export function xmlMoney(block: string, tag: string): { amount: number | null; currency: string | null } {
  const m = block.match(new RegExp(`<${tag}([^>]*)>([^<]*)</${tag}>`, "i"));
  if (!m) return { amount: null, currency: null };
  const n = Number(String(m[2]).replace(/,/g, ""));
  const cur = m[1].match(/currencyID="([^"]+)"/i)?.[1] ?? null;
  return { amount: Number.isFinite(n) ? n : null, currency: cur };
}

function decodeXml(s: string | null): string {
  if (!s) return "";
  return s
    .replaceAll("\u0026amp;", "&")
    .replaceAll("\u0026lt;", "<")
    .replaceAll("\u0026gt;", ">")
    .replaceAll("\u0026quot;", '"')
    .replaceAll("\u0026apos;", "'");
}

export function parseEbayOrdersXml(body: string, marketplace: MarketplaceId): SaleOrder[] {
  const host = marketplace === "EBAY_GB" ? "https://www.ebay.co.uk" : "https://www.ebay.com";
  const orders: SaleOrder[] = [];
  for (const block of xmlBlocks(body, "Order")) {
    const id = decodeXml(xmlText(block, "OrderID")).trim();
    if (!id) continue;
    const total = xmlMoney(block, "Total");
    const paid = xmlMoney(block, "AmountPaid");
    const amount = total.amount ?? paid.amount;
    const currency = total.currency || paid.currency || "GBP";
    const items = xmlBlocks(block, "Transaction").map((tx) => {
      const itemBlock = xmlBlocks(tx, "Item")[0] ?? tx;
      const qty = Number(xmlText(tx, "QuantityPurchased") ?? "1") || 1;
      const price = xmlMoney(tx, "TransactionPrice").amount;
      return {
        title: decodeXml(xmlText(itemBlock, "Title")) || "eBay item",
        sku: decodeXml(xmlText(itemBlock, "SKU")).trim() || null,
        itemNo: null,
        qty,
        price,
      };
    });
    const itemCount = items.reduce((n, it) => n + it.qty, 0) || Number(xmlText(block, "QuantityPurchased") ?? "0") || items.length;
    orders.push({
      id,
      channel: "ebay",
      status: decodeXml(xmlText(block, "OrderStatus")) || "Unknown",
      createdAt: decodeXml(xmlText(block, "CreatedTime")) || "",
      buyer: decodeXml(xmlText(block, "BuyerUserID")) || "eBay buyer",
      total: amount,
      currency,
      itemCount: itemCount || 1,
      items,
      url: `${host}/mesh/ord/details?orderid=${encodeURIComponent(id)}`,
      pulled: false,
    });
  }
  return orders;
}

export function parseEbayOrderDetail(body: string, marketplace: MarketplaceId): SaleOrderDetail {
  const summary = parseEbayOrdersXml(body, marketplace)[0];
  if (!summary) throw new Error("eBay did not return that order.");
  const block = xmlBlocks(body, "Order")[0] ?? "";
  const addr = xmlBlocks(block, "ShippingAddress")[0] ?? "";
  const ship = xmlBlocks(block, "ShippingServiceSelected")[0] ?? xmlBlocks(block, "ShippingDetails")[0] ?? "";
  const name = decodeXml(xmlText(addr, "Name"));
  const line1 = decodeXml(xmlText(addr, "Street1"));
  const line2 = decodeXml(xmlText(addr, "Street2"));
  const city = decodeXml(xmlText(addr, "CityName"));
  const region = decodeXml(xmlText(addr, "StateOrProvince"));
  const postal = decodeXml(xmlText(addr, "PostalCode"));
  const country = decodeXml(xmlText(addr, "CountryName")) || decodeXml(xmlText(addr, "Country"));
  const hasAddr = Boolean(name || line1 || city || postal);
  const shippingCost = xmlMoney(ship, "ShippingServiceCost").amount ?? xmlMoney(block, "ShippingServiceCost").amount;
  const subtotal = xmlMoney(block, "Subtotal").amount;
  return {
    ...summary,
    email: decodeXml(xmlText(block, "Email")) || null,
    phone: decodeXml(xmlText(addr, "Phone")) || null,
    payment: decodeXml(xmlText(block, "PaymentMethod")) || decodeXml(xmlText(block, "eBayPaymentStatus")) || null,
    shippingMethod: decodeXml(xmlText(ship, "ShippingService")) || null,
    shippingCost,
    subtotal,
    remarks: decodeXml(xmlText(block, "BuyerCheckoutNotes")) || decodeXml(xmlText(block, "BuyerCheckoutMessage")) || null,
    address: hasAddr
      ? { name, line1, line2, city, region, postal, country }
      : null,
    paidAt: decodeXml(xmlText(block, "PaidTime")) || null,
    shippedAt: decodeXml(xmlText(block, "ShippedTime")) || null,
    postage: null,
  };
}
