import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildClickAndDropOrder, countryCode, parseCreateOrdersResponse, requiredCity } from "./royal-mail.ts";
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
  it("maps UK country names to GBR for OLP Click & Drop", () => {
    assert.equal(countryCode("United Kingdom"), "GBR");
    assert.equal(countryCode("uk"), "GBR");
    assert.equal(countryCode("GB"), "GBR");
    assert.equal(countryCode("GBR"), "GBR");
  });

  it("builds a Click & Drop create-order payload with OLP codes", () => {
    const body = buildClickAndDropOrder(detail, {
      serviceCode: "TOLP48",
      packageFormat: "smallParcel",
      weightGrams: 250,
    });
    const item = body.items[0];
    assert.equal(item.orderReference, "BS-bricklink-32419849");
    assert.equal(item.recipient.address.postcode, "SW1A 2AA");
    assert.equal(item.recipient.address.countryCode, "GBR");
    assert.equal(item.postageDetails.serviceCode, "TOLP48");
    assert.equal(item.packages[0].weightInGrams, 250);
    assert.equal(item.packages[0].contents[0].SKU, "GBB-MINIFIG-SW1070-0001");
    assert.equal(item.packages[0].contents[0].originCountryCode, "GBR");
    assert.equal(item.recipient.address.city, "London");
    assert.equal(item.billing.address.city, "London");
    assert.equal(item.billing.address.addressLine1, "10 Downing Street");
    assert.equal("label" in item, false);
  });

  it("fills city and billing when the order has no town", () => {
    const blank = {
      ...detail,
      address: { ...detail.address!, city: "  ", region: "", line2: "" },
    };
    const item = buildClickAndDropOrder(blank, {
      serviceCode: "TOLP24",
      packageFormat: "smallParcel",
      weightGrams: 100,
    }).items[0];
    assert.equal(requiredCity(blank.address!), "Unknown");
    assert.equal(item.recipient.address.city, "Unknown");
    assert.equal(item.billing.address.city, "Unknown");
  });

  it("only treats createdOrders as a new Click & Drop order", () => {
    const ok = parseCreateOrdersResponse({
      successCount: 1,
      errorsCount: 0,
      createdOrders: [{ orderIdentifier: 98765, orderReference: "BS-ebay-1" }],
      failedOrders: [],
    });
    assert.equal(ok.id, "98765");
    assert.equal(ok.reference, "BS-ebay-1");
    assert.throws(
      () =>
        parseCreateOrdersResponse({
          orders: [{ orderIdentifier: 1 }],
        }),
      /did not create/,
    );
    assert.throws(
      () =>
        parseCreateOrdersResponse({
          successCount: 0,
          errorsCount: 1,
          createdOrders: [],
          failedOrders: [{ errors: [{ message: "City is required" }] }],
        }),
      /City is required/,
    );
  });
});
