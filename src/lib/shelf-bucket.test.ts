import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shelfBucket } from "./types.ts";

describe("shelf buckets", () => {
  it("puts complete sets on the complete shelf", () => {
    assert.equal(
      shelfBucket({ status: "complete", itemType: "set", condition: "used_complete" }),
      "complete",
    );
  });

  it("puts incomplete sets on incomplete", () => {
    assert.equal(
      shelfBucket({ status: "incomplete", itemType: "set", condition: "used_incomplete" }),
      "incomplete",
    );
  });

  it("puts available minifigs on the minifig shelf, not incomplete", () => {
    assert.equal(
      shelfBucket({ status: "complete", itemType: "minifig", condition: "used_complete" }),
      "minifig",
    );
    assert.equal(
      shelfBucket({ status: "incomplete", itemType: "minifig", condition: "used_complete" }),
      "minifig",
    );
  });

  it("puts sold lots on sold regardless of type", () => {
    assert.equal(shelfBucket({ status: "sold", itemType: "set", condition: "used_complete" }), "sold");
    assert.equal(shelfBucket({ status: "sold", itemType: "minifig", condition: "used_complete" }), "sold");
  });
});
