import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { exactSkuMatch, lotsAtLocation, normalizeScan, runEnquiry } from "./enquiry.ts";
import type { LegoSet } from "./types.ts";

function lot(partial: Partial<LegoSet> & { id: number; sku: string }): LegoSet {
  return {
    itemType: "set",
    setNum: "75192-1",
    location: "",
    name: "Millennium Falcon",
    year: 2017,
    theme: "Star Wars",
    themeId: 1,
    category: "Star Wars",
    subCategory: null,
    weightGrams: null,
    numParts: null,
    imageUrl: null,
    extraPhotos: [],
    batchNumber: "",
    condition: "used_complete",
    comesWithInstructions: "yes",
    comesWithBox: "yes",
    qty: 1,
    askingPrice: 650,
    currency: "GBP",
    usedPrice: null,
    usedPriceMin: null,
    usedPriceMax: null,
    usedPriceSource: null,
    usedPriceAt: null,
    newPrice: null,
    newPriceMin: null,
    newPriceMax: null,
    retailPrice: null,
    notes: "",
    status: "complete",
    ebayItemId: null,
    ebayListingUrl: null,
    ebayTitle: null,
    ebayListed: false,
    ebayListingStatus: "not_listed",
    ebaySyncedAt: null,
    blListed: false,
    blInventoryId: null,
    blListingUrl: null,
    blListingStatus: "not_listed",
    blSyncedAt: null,
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

describe("product enquiry", () => {
  const lots = [
    lot({ id: 1, sku: "GBB-SET-75192-0001", location: "A-12", name: "Millennium Falcon" }),
    lot({
      id: 2,
      sku: "GBB-SET-10294-0001",
      setNum: "10294-1",
      name: "Titanic",
      location: "A-12",
    }),
    lot({
      id: 3,
      sku: "GBB-MINIFIG-SW1070-0001",
      setNum: "sw1070",
      name: "Yuletide Squadron Pilot",
      itemType: "minifig",
      location: "BIN-03",
      status: "incomplete",
    }),
  ];

  it("strips scanner newlines", () => {
    assert.equal(normalizeScan("GBB-SET-75192-0001\r\n"), "GBB-SET-75192-0001");
  });

  it("matches a scanned SKU exactly", () => {
    const hit = exactSkuMatch(lots, "gbb-set-75192-0001");
    assert.equal(hit?.id, 1);
  });

  it("lists every lot at a scanned location", () => {
    const at = lotsAtLocation(lots, "A-12");
    assert.equal(at.length, 2);
    const hit = runEnquiry(lots, "a-12", ["A-12", "BIN-03"]);
    assert.equal(hit.mode, "location");
    assert.equal(hit.location, "A-12");
    assert.equal(hit.lots.length, 2);
  });

  it("treats a settings location with no stock as a location search", () => {
    const hit = runEnquiry(lots, "EMPTY-1", ["EMPTY-1"]);
    assert.equal(hit.mode, "location");
    assert.equal(hit.lots.length, 0);
  });
});
