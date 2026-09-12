import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPaidSale, saleLineSkus } from "./sold-rules.ts";

describe("sold sku sync", () => {
  it("collects unique normalised SKUs from sale lines", () => {
    assert.deepEqual(
      saleLineSkus([
        { title: "A", sku: "gbb-set-0001", itemNo: "1", qty: 1, price: 1 },
        { title: "B", sku: " GBB-SET-0001 ", itemNo: "1", qty: 1, price: 1 },
        { title: "C", sku: null, itemNo: "2", qty: 1, price: 1 },
        { title: "D", sku: "gbb-minifig-0002", itemNo: "x", qty: 1, price: 1 },
      ]),
      ["GBB-SET-0001", "GBB-MINIFIG-0002"],
    );
  });

  it("only treats paid marketplace orders as sold", () => {
    assert.equal(isPaidSale("ebay", "Completed"), true);
    assert.equal(isPaidSale("ebay", "Active"), false);
    assert.equal(isPaidSale("ebay", "Cancelled"), false);
    assert.equal(isPaidSale("bricklink", "Paid"), true);
    assert.equal(isPaidSale("bricklink", "Packed"), true);
    assert.equal(isPaidSale("bricklink", "Pending"), false);
    assert.equal(isPaidSale("bricklink", "Updated"), false);
  });
});
