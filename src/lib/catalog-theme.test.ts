import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractBricklinkPair, extractBricksetPair, slugToName, splitThemePath, themePath, usefulSubcategory } from "./theme-path.ts";

describe("themePath", () => {
  const groups = new Set(["Licensed"]);
  const nodes = new Map([
    [1, { id: 1, name: "Ninjago", parentId: null }],
    [2, { id: 2, name: "Rise of the Snakes", parentId: 1 }],
    [3, { id: 3, name: "Spinners", parentId: 2 }],
    [10, { id: 10, name: "Licensed", parentId: null }],
    [11, { id: 11, name: "Star Wars", parentId: 10 }],
    [12, { id: 12, name: "Ultimate Collector Series", parentId: 11 }],
    [20, { id: 20, name: "Catalog", parentId: null }],
    [21, { id: 21, name: "Sets", parentId: 20 }],
    [22, { id: 22, name: "NINJAGO", parentId: 21 }],
    [23, { id: 23, name: "Rise of the Snakes", parentId: 22 }],
  ]);

  it("uses Rise of the Snakes as the Ninjago subcat", () => {
    const split = splitThemePath(themePath(2, nodes));
    assert.equal(split.category, "Ninjago");
    assert.equal(split.subCategory, "Rise of the Snakes");
  });

  it("keeps the wave when the leaf is a spinner", () => {
    const split = splitThemePath(themePath(3, nodes));
    assert.equal(split.category, "Ninjago");
    assert.equal(split.subCategory, "Rise of the Snakes");
  });

  it("skips Licensed grouping for Star Wars UCS", () => {
    const split = splitThemePath(themePath(12, nodes, groups));
    assert.equal(split.category, "Star Wars");
    assert.equal(split.subCategory, "Ultimate Collector Series");
  });

  it("maps BrickLink Catalog/Sets/NINJAGO/Rise of the Snakes", () => {
    const split = splitThemePath(themePath(23, nodes));
    assert.equal(split.category, "NINJAGO");
    assert.equal(split.subCategory, "Rise of the Snakes");
  });
});

describe("usefulSubcategory", () => {
  it("drops junk and duplicates of the theme", () => {
    assert.equal(usefulSubcategory("Ninjago", "Ninjago"), null);
    assert.equal(usefulSubcategory("Set Entry", "NINJAGO"), null);
    assert.equal(usefulSubcategory("9449-1", "NINJAGO"), null);
    assert.equal(usefulSubcategory("Rise of the Snakes", "NINJAGO"), "Rise of the Snakes");
  });

  it("turns a Brickset slug into a name", () => {
    assert.equal(slugToName("Rise-of-the-Snakes"), "Rise of the Snakes");
  });
});

describe("html subcat extraction", () => {
  it("reads Brickset theme + subtheme links", () => {
    const html = `
      <title>LEGO 9449 Ultra Sonic Raider | Brickset</title>
      <a href="/sets/theme-Ninjago">Ninjago</a>
      <a href="/sets/theme-Ninjago/subtheme-Rise-of-the-Snakes">Rise of the Snakes</a>
      <dt>Theme</dt><dd><a href="/sets/theme-Ninjago">Ninjago</a></dd>
      <dt>Subtheme</dt><dd><a href="/sets/theme-Ninjago/subtheme-Rise-of-the-Snakes">Rise of the Snakes</a></dd>
    `;
    const d = extractBricksetPair(html);
    assert.equal(d.category, "Ninjago");
    assert.equal(d.subCategory, "Rise of the Snakes");
  });

  it("reads BrickLink catString depth 1 + 2", () => {
    const html = `
      <a href="//www.bricklink.com/catalog.asp">Catalog</a> :
      <a href="//www.bricklink.com/catalogTree.asp?itemType=S">Sets</a> :
      <a href="//www.bricklink.com/catalogList.asp?catType=S&catString=759">NINJAGO</a> :
      <a href="//www.bricklink.com/catalogList.asp?catType=S&catString=759.945">Rise of the Snakes</a> :
      9449-1 <b>Set Entry</b>
    `;
    const d = extractBricklinkPair(html);
    assert.equal(d.category, "NINJAGO");
    assert.equal(d.subCategory, "Rise of the Snakes");
  });
});
