import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { flattenOrderItems, mapBlItems } from "./bricklink-order-items.ts";

describe("bricklink order items", () => {
  it("flattens batched Get Order Items payloads", () => {
    const batches = [
      [
        {
          inventory_id: 1,
          item: { no: "avt009", name: "Norm Spellman - Na'vi", type: "MINIFIG" },
          color_name: "(Not Applicable)",
          quantity: 1,
          new_or_used: "U",
          remarks: "GBB10213M",
          disp_unit_price: "4.1310",
        },
      ],
    ];
    const lines = mapBlItems(flattenOrderItems(batches));
    assert.equal(lines.length, 1);
    assert.equal(lines[0].title, "Norm Spellman - Na'vi");
    assert.equal(lines[0].itemNo, "avt009");
    assert.equal(lines[0].itemKind, "Minifigure");
    assert.equal(lines[0].condition, "Used");
    assert.equal(lines[0].sku, "GBB10213M");
    assert.equal(lines[0].price, 4.131);
    assert.match(lines[0].imageUrl ?? "", /avt009/);
  });
});
