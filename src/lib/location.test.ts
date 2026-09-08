import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addLocationOption,
  locationChoices,
  mergeLocationOptions,
  parseLocations,
  removeLocationOption,
} from "./locations.ts";

describe("location options", () => {
  it("parses, trims, and de-dupes", () => {
    assert.deepEqual(parseLocations([" A-12 ", "a-12", "BIN-03", "", "\n"]), ["A-12", "BIN-03"]);
  });

  it("keeps a current value that is not yet in settings", () => {
    assert.deepEqual(locationChoices(["BIN-03"], "A-12"), ["A-12", "BIN-03"]);
  });

  it("adds and removes", () => {
    const added = addLocationOption(["A-12"], " bin-03 ");
    assert.ok(!("error" in added));
    assert.deepEqual(added.list, ["A-12", "bin-03"]);
    assert.equal("error" in addLocationOption(["A-12"], "a-12"), true);
    assert.deepEqual(removeLocationOption(["A-12", "BIN-03"], "a-12"), ["BIN-03"]);
  });

  it("merges CSV extras", () => {
    assert.deepEqual(mergeLocationOptions(["A-12"], ["A-12", "SHELF B4"]), ["A-12", "SHELF B4"]);
  });
});
