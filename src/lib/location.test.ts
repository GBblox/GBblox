import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addLocationOption,
  locationChoices,
  mergeLocationOptions,
  moveLocationOption,
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

  it("shows MF locations only on minifigs", () => {
    const saved = ["A-12", "MF-01", "mf-02", "BIN-03"];
    assert.deepEqual(locationChoices(saved, "", "minifig"), ["MF-01", "mf-02"]);
    assert.deepEqual(locationChoices(saved, "", "set"), ["A-12", "BIN-03"]);
    assert.deepEqual(locationChoices(saved, "MF-01", "set"), ["A-12", "BIN-03"]);
    assert.deepEqual(locationChoices(saved, "A-12", "minifig"), ["MF-01", "mf-02"]);
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

  it("reorders by index", () => {
    assert.deepEqual(moveLocationOption(["A", "B", "C"], 2, 0), ["C", "A", "B"]);
    assert.deepEqual(moveLocationOption(["A", "B", "C"], 0, 2), ["B", "C", "A"]);
    assert.deepEqual(moveLocationOption(["A", "B", "C"], 1, 1), ["A", "B", "C"]);
    assert.deepEqual(moveLocationOption(["A", "B", "C"], -1, 0), ["A", "B", "C"]);
  });
});
