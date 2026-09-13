import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEbayStoreCategories, pickStoreMapping } from "./ebay-store.ts";

const xml = `
<CustomCategories>
  <CustomCategory>
    <CategoryID>10</CategoryID>
    <Name>NINJAGO</Name>
    <ChildCategory>
      <CategoryID>11</CategoryID>
      <Name>Rise of the Snakes</Name>
    </ChildCategory>
    <ChildCategory>
      <CategoryID>12</CategoryID>
      <Name>Legacy</Name>
    </ChildCategory>
  </CustomCategory>
  <CustomCategory>
    <CategoryID>20</CategoryID>
    <Name>Star Wars</Name>
    <ChildCategory>
      <CategoryID>21</CategoryID>
      <Name>Ultimate Collector Series</Name>
    </ChildCategory>
  </CustomCategory>
  <CustomCategory>
    <CategoryID>30</CategoryID>
    <Name>Minifigures</Name>
  </CustomCategory>
</CustomCategories>
`;

describe("parseEbayStoreCategories", () => {
  it("keeps parent/child ids", () => {
    const cats = parseEbayStoreCategories(xml);
    const ninjago = cats.find((c) => c.name === "NINJAGO");
    const snakes = cats.find((c) => c.name === "Rise of the Snakes");
    assert.equal(ninjago?.id, "10");
    assert.equal(ninjago?.parentId, null);
    assert.equal(snakes?.id, "11");
    assert.equal(snakes?.parentId, "10");
  });
});

describe("pickStoreMapping", () => {
  const cats = parseEbayStoreCategories(xml);

  it("maps a Ninjago set to store category + subcat", () => {
    const mapped = pickStoreMapping(cats, {
      itemType: "set",
      category: "Ninjago",
      subCategory: "Rise of the Snakes",
      theme: "Ninjago",
    });
    assert.equal(mapped.category?.name, "NINJAGO");
    assert.equal(mapped.subCategory?.name, "Rise of the Snakes");
  });

  it("maps a Ninjago minifig to the same store path", () => {
    const mapped = pickStoreMapping(cats, {
      itemType: "minifig",
      category: "Ninjago",
      subCategory: "Rise of the Snakes",
      theme: "Ninjago",
    });
    assert.equal(mapped.category?.name, "NINJAGO");
    assert.equal(mapped.subCategory?.name, "Rise of the Snakes");
  });
});
