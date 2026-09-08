import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { labelSizeOf } from "./printer-settings.ts";
import { barcodeModuleWidth, buildThermalLabel, generateEpl, generateEscp, generateTspl, generateZpl, labelLayout, wrapWords } from "./thermal.ts";

const lot = {
  sku: "GBB-SET-75192-0001",
  name: "Millennium Falcon",
  setNum: "75192-1",
  itemType: "set" as const,
};

const job = { sizeId: "dk-11202" as const, dpi: 203 as const, darkness: 15, copies: 2 };
const dk11202 = labelSizeOf("dk-11202");
const dk1241 = labelSizeOf("dk-1241");
const pw203 = String(Math.round(dk11202.widthIn * 203));
const ll203 = String(Math.round(dk11202.heightIn * 203));
const pw300 = String(Math.round(dk1241.widthIn * 300));
const ll300 = String(Math.round(dk1241.heightIn * 300));

describe("thermal labels", () => {
  it("builds ZPL with Code 128 of the SKU and copy count", () => {
    const zpl = generateZpl(lot, job);
    assert.match(zpl, /^\^XA/m);
    assert.match(zpl, /\^XZ\s*$/);
    assert.match(zpl, new RegExp(`\\^PW${pw203}`));
    assert.match(zpl, new RegExp(`\\^LL${ll203}`));
    assert.match(zpl, /\^BCN,/);
    assert.match(zpl, /\^FDGBB-SET-75192-0001\^FS/);
    assert.match(zpl, /\^FDMILLENNIUM FALCON\^FS/i);
    assert.match(zpl, /\^PQ2/);
    assert.match(zpl, /\^CI28/);
  });

  it("sizes DK-1241 at 300 dpi", () => {
    const zpl = generateZpl(lot, { ...job, sizeId: "dk-1241", dpi: 300 });
    assert.match(zpl, new RegExp(`\\^PW${pw300}`));
    assert.match(zpl, new RegExp(`\\^LL${ll300}`));
  });

  it("escapes ZPL control characters in the name", () => {
    const zpl = generateZpl({ ...lot, name: "Falcon ^XA ~DB" }, job);
    assert.doesNotMatch(zpl, /\^FDFalcon \^XA/);
    assert.match(zpl, /\^FDFalcon/);
  });

  it("builds TSPL with SIZE, BARCODE 128, and PRINT", () => {
    const tspl = generateTspl(lot, job);
    assert.match(tspl, new RegExp(`^SIZE ${dk11202.widthIn},${dk11202.heightIn}`, "m"));
    assert.match(tspl, /BARCODE \d+,\d+,"128",/);
    assert.match(tspl, /"GBB-SET-75192-0001"/);
    assert.match(tspl, /^PRINT 2,1/m);
    assert.match(tspl, /^CLS/m);
  });

  it("escapes TSPL quotes in the name", () => {
    const tspl = generateTspl({ ...lot, name: 'Han "Solo" figure' }, job);
    assert.match(tspl, /Han 'Solo'/);
    assert.doesNotMatch(tspl, /Han "Solo"/);
  });

  it("builds EPL with Code 128", () => {
    const epl = generateEpl(lot, job);
    assert.match(epl, /^N$/m);
    assert.match(epl, new RegExp(`^q${pw203}$`, "m"));
    assert.match(epl, new RegExp(`^Q${ll203},24$`, "m"));
    assert.match(epl, /B\d+,\d+,0,1,/);
    assert.match(epl, /"GBB-SET-75192-0001"/);
    assert.match(epl, /^P2$/m);
  });

  it("buildThermalLabel picks the language extension", () => {
    const z = buildThermalLabel(lot, { ...job, language: "zpl", connection: "usb", baudRate: 9600 });
    assert.equal(z.filename, "GBB-SET-75192-0001.zpl");
    assert.match(z.text, /\^XA/);
    const t = buildThermalLabel(lot, { ...job, language: "tspl", connection: "download", baudRate: 9600 });
    assert.equal(t.filename, "GBB-SET-75192-0001.tspl");
    const e = buildThermalLabel(lot, { ...job, language: "epl", connection: "download", baudRate: 9600 });
    assert.equal(e.filename, "GBB-SET-75192-0001.epl");
    const p = buildThermalLabel(lot, { ...job, language: "escp", connection: "usb", baudRate: 9600 });
    assert.equal(p.filename, "GBB-SET-75192-0001.prn");
    assert.ok(p.bytes && p.bytes.length > 20);
    assert.equal(p.bytes[0], 0x1b);
    assert.equal(p.bytes[1], 0x69);
    assert.equal(p.bytes[2], 0x61);
    assert.equal(p.bytes[3], 0x00);
  });

  it("builds Brother ESC/P for the QL-1110NWB", () => {
    const bytes = generateEscp(lot, { sizeId: "dk-62x29", copies: 1 });
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
    assert.match(hex, /^1b 69 61 00 1b 40 1b 69 4c 00/);
    assert.match(hex, /1b 28 43 02 00/);
    assert.match(hex, /1b 6b 0b/);
    assert.match(hex, /1b 69 74 61 72 00 68/);
    assert.match(hex, /77 02 42/);
    assert.ok(hex.includes("5c 5c 5c"));
    assert.match(hex, /1b 69 43 01/);
    assert.match(hex, /0c$/);
    const sku = "GBB-SET-75192-0001";
    const skuHex = Array.from(sku, (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join(" ");
    assert.ok(hex.includes(skuHex));
    const twice = generateEscp(lot, { sizeId: "dk-62x29", copies: 2 });
    assert.equal(twice.length, bytes.length * 2);
  });

  it("wraps long names", () => {
    const lines = wrapWords("Ultimate Collector Series Millennium Falcon Display Stand", 18, 2);
    assert.equal(lines.length, 2);
    assert.ok(lines[0].length <= 18);
  });

  it("picks a barcode module that fits 4 inches", () => {
    const L = labelLayout(4, 2, 203, lot.sku);
    assert.equal(L.w, 812);
    assert.equal(L.h, 406);
    assert.ok(L.module >= 1 && L.module <= 4);
    const width = barcodeModuleWidth(lot.sku, L.innerW);
    assert.equal(width, L.module);
  });

  it("prints a location barcode instead of SKU", () => {
    const locLot = { ...lot, location: "A-12", barcodeField: "location" as const };
    const zpl = generateZpl(locLot, job);
    assert.match(zpl, /\^FDA-12\^FS/);
    assert.match(zpl, /\^FDLOCATION\^FS/);
    assert.doesNotMatch(zpl, /\^FDGBB-SET-75192-0001\^FS/);
    assert.doesNotMatch(zpl, /Millennium Falcon/i);
    assert.doesNotMatch(zpl, /\^FD75192\^FS/);
    const built = buildThermalLabel(locLot, { ...job, language: "zpl", connection: "download", baudRate: 9600 });
    assert.equal(built.filename, "A-12.zpl");
  });

  it("keeps location off SKU labels", () => {
    const zpl = generateZpl({ ...lot, location: "A-12" }, job);
    assert.doesNotMatch(zpl, /A-12/);
    assert.match(zpl, /\^FDGBB-SET-75192-0001\^FS/);
  });
});
