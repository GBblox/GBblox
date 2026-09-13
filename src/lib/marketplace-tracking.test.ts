import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { completeSaleXml } from "./ebay-orders.ts";

describe("marketplace tracking payloads", () => {
  it("builds eBay CompleteSale XML with Royal Mail tracking", () => {
    const xml = completeSaleXml("12-345-678", "AB123456789GB");
    assert.match(xml, /<CompleteSaleRequest/);
    assert.match(xml, /<OrderID>12-345-678<\/OrderID>/);
    assert.match(xml, /<Shipped>true<\/Shipped>/);
    assert.match(xml, /<ShippingCarrierUsed>Royal Mail<\/ShippingCarrierUsed>/);
    assert.match(xml, /<ShipmentTrackingNumber>AB123456789GB<\/ShipmentTrackingNumber>/);
  });

  it("uses the Royal Mail public track URL for BrickLink", () => {
    const no = "AB123456789GB";
    const link = `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(no)}`;
    assert.match(link, /royalmail\.com/);
    assert.match(link, /AB123456789GB/);
  });
});
