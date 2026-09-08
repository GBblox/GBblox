import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bricklinkItemCandidates, parseBricklinkPriceGuide } from "./bricklink-price.ts";

describe("bricklink price guide", () => {
  it("tries SET-1 before the bare set number", () => {
    assert.deepEqual(bricklinkItemCandidates("set", "75192"), ["75192-1", "75192"]);
    assert.deepEqual(bricklinkItemCandidates("minifig", "sw0001"), ["sw0001"]);
  });

  it("maps BrickLink sold stats", () => {
    const band = parseBricklinkPriceGuide(
      {
        item: { no: "75192-1" },
        new_or_used: "U",
        currency_code: "GBP",
        min_price: "420.0000",
        max_price: "890.5000",
        avg_price: "610.1111",
        qty_avg_price: "640.2500",
        unit_quantity: 12,
        total_quantity: 18,
      },
      "sold",
    );
    assert.ok(band);
    assert.equal(band.min, 420);
    assert.equal(band.max, 890.5);
    assert.equal(band.avg, 640.25);
    assert.equal(band.condition, "U");
    assert.equal(band.guideType, "sold");
  });

  it("returns null when BrickLink has no prices", () => {
    assert.equal(parseBricklinkPriceGuide({ min_price: "0", avg_price: "0", max_price: "0" }, "sold"), null);
  });
});
