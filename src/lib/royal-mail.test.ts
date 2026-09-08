import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildClickAndDropOrder, countryCode } from "./royal-mail.ts";
import type { SaleOrderDetail } from "./types.ts";

const detail: SaleOrderDetail = {
  id: "32419849",
  channel: "bricklink",
  status: "Paid",
  createdAt: "2026-08-25T10:00:00.000Z",
  buyer: "Pickett27",
  total: 8.08,
  currency: "GBP",
  itemCount: 1,
  items: [{ title: "sw1070 Yuletide Squadron Pilot", sku: "GBB-MINIFIG-SW1070-0001", itemNo: "sw1070", qty: 1, price: 8.08 }],
  url: "",
  pulled: true,
  email: "a@b.c",
  phone: null,
  payment: "PayPal",
  shippingMethod: "Standard",
  shippingCost: 2.5,
  subtotal: 5.58,
  remarks: null,
  address: {
    name: "Alex Pickett",
    line1: "10 Downing Street",
    line2: "",
    city: "London",
    region: "",
    postal: "SW1A 2AA",
    country: "United Kingdom",
  },
  paidAt: null,
  shippedAt: null,
  postage: null,
};

describe("royal mail click and drop", () => {
  it("maps UK country names to GB", () => {
    assert.equal(countryCode("United Kingdom"), "GB");
    assert.equal(countryCode("uk"), "GB");
    assert.equal(countryCode("GB"), "GB");
  });

  it("builds a Click & Drop create-order payload", () => {
    const body = buildClickAndDropOrder(detail, {
      serviceCode: "TPS48",
      packageFormat: "smallParcel",
      weightGrams: 250,
      includeLabel: true,
    });
    const item = body.items[0];
    assert.equal(item.orderReference, "BS-bricklink-32419849");
    assert.equal(item.recipient.address.postcode, "SW1A 2AA");
    assert.equal(item.recipient.address.countryCode, "GB");
    assert.equal(item.postageDetails.serviceCode, "TPS48");
    assert.equal(item.packages[0].weightInGrams, 250);
    assert.equal(item.packages[0].contents[0].SKU, "GBB-MINIFIG-SW1070-0001");
    assert.equal(item.label.includeLabelInResponse, true);
  });
});
