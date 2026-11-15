/**
 * Law type ids that belong to the retired catalogues. New worlds seed only the
 * one law book, so none of these may exist in a reset world. The tables below
 * stay in the code only for saved worlds that are never reset (local
 * singleplayer saves); this module turns them into the sentinel list the reset
 * and its residue scan test against.
 */
import { PROGRAM_LAW_MAPPING, TAX_LAW_MAPPING } from "@/lib/legislation/oldBookMapping";
import { SAVED_WORLD_COST_CLASS } from "@/lib/era/savedWorldCostClasses";
import { SAVED_WORLD_LEGISLATION_ERA } from "@/lib/era/savedWorldLegislationEra";
import { SAVED_WORLD_MINIMUM_WAGE_LAW_SCALES } from "@/lib/labour/rules/minimumWageLaw";

export const OLD_CATALOGUE_LAW_IDS: ReadonlySet<string> = new Set([
  ...Object.keys(PROGRAM_LAW_MAPPING),
  ...Object.keys(TAX_LAW_MAPPING),
  ...Object.keys(SAVED_WORLD_COST_CLASS),
  ...Object.keys(SAVED_WORLD_LEGISLATION_ERA),
  ...Object.keys(SAVED_WORLD_MINIMUM_WAGE_LAW_SCALES),
]);

export function isOldCatalogueLawId(id: unknown): id is string {
  return typeof id === "string" && OLD_CATALOGUE_LAW_IDS.has(id);
}

/** Every old-catalogue id named by a string anywhere inside a document value. */
export function oldCatalogueIdsWithin(value: unknown): string[] {
  const found = new Set<string>();
  const walk = (node: unknown, depth: number): void => {
    if (depth > 8) return;
    if (typeof node === "string") {
      if (OLD_CATALOGUE_LAW_IDS.has(node)) found.add(node);
    } else if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
    } else if (node && typeof node === "object") {
      for (const item of Object.values(node)) walk(item, depth + 1);
    }
  };
  walk(value, 0);
  return [...found].sort();
}
