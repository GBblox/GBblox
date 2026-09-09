import { bricklinkItemCandidates, bricklinkItemType } from "./bricklink-price";
import { bricklinkUrl, conditionCode } from "./format";
import type { LegoSet } from "./types";

export type BricklinkDraft = {
  itemNo: string;
  itemType: "SET" | "MINIFIG";
  condition: "N" | "U";
  completeness: "S" | "C" | "B" | null;
  quantity: number;
  unitPrice: number | null;
  remarks: string;
  description: string;
  catalogUrl: string;
};

export function completenessOf(set: LegoSet): "S" | "C" | "B" {
  if (set.condition === "new_sealed") return "S";
  if (set.condition === "used_incomplete" || set.condition === "used_parts") return "B";
  return "C";
}

export function completenessLabel(value: "S" | "C" | "B" | null): string {
  if (value === "S") return "Sealed";
  if (value === "C") return "Complete";
  if (value === "B") return "Incomplete";
  return "—";
}

export function bricklinkListingDescription(set: LegoSet): string {
  const instructions =
    set.comesWithInstructions === "yes" ? "Comes with instructions" : "Does not come with instructions";
  const box = set.comesWithBox === "yes" ? "Comes with box" : "Does not come with box";
  const notes = set.notes.trim();
  const body = notes ? `${instructions} - ${box}. ${notes}` : `${instructions} - ${box}`;
  return body.slice(0, 2000);
}

export function composeBricklinkListing(set: LegoSet): BricklinkDraft {
  return {
    itemNo: bricklinkItemCandidates(set.itemType, set.setNum)[0] ?? set.setNum,
    itemType: bricklinkItemType(set.itemType),
    condition: conditionCode(set.condition),
    completeness: set.itemType === "minifig" ? null : completenessOf(set),
    quantity: Math.max(1, set.qty),
    unitPrice: set.askingPrice,
    remarks: set.sku,
    description: bricklinkListingDescription(set),
    catalogUrl: bricklinkUrl(set.setNum, set.itemType),
  };
}
