import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  LEGISLATION_ERA,
  isLegislationTypeActive,
  isLegislationTypeFileable,
  isNewThisEra,
} from "./legislationCatalog";
import { SAVED_WORLD_LEGISLATION_ERA } from "./savedWorldLegislationEra";
import KNOWN_DATED_IDS from "./datedLegislationIds.snapshot.json";

describe("saved-world law type first years", () => {
  it("only lists types that new worlds no longer seed", () => {
    for (const id of Object.keys(SAVED_WORLD_LEGISLATION_ERA))
      expect(LEGISLATION_ERA[id], id).toBeUndefined();
  });

  it("keeps an old law closed before its first year", () => {
    expect(isLegislationTypeFileable("cn_common_prosperity", 2006)).toBe(false);
    expect(isLegislationTypeFileable("cn_belt_and_road", 2006)).toBe(false);
    expect(isLegislationTypeFileable("jp_nuclear_energy", 1953)).toBe(false);
    expect(isLegislationTypeFileable("de_solidarity_surcharge", 1990)).toBe(false);
    expect(isLegislationTypeFileable("us_medicaid", 1964)).toBe(false);
  });

  it("opens an old law from its first year on", () => {
    expect(isLegislationTypeFileable("cn_common_prosperity", 2021)).toBe(true);
    expect(isLegislationTypeActive("de_solidarity_surcharge", 1991)).toBe(true);
    expect(isNewThisEra("cn_belt_and_road", 2014)).toBe(true);
  });

  it("leaves undated old laws open in every year", () => {
    expect(isLegislationTypeFileable("cn_pla_modernization", 1953)).toBe(true);
  });
});

describe("saved-world first year table source", () => {
  it("lists each law type once", () => {
    const source = readFileSync(join(__dirname, "savedWorldLegislationEra.ts"), "utf8");
    const keys = [...source.matchAll(/^  ([a-z0-9_]+): \d/gm)].map((m) => m[1]);
    expect(keys.filter((key, i) => keys.indexOf(key) !== i)).toEqual([]);
  });
});

describe("removing a dated law type from the era catalog", () => {
  const dated = (id: string) =>
    typeof LEGISLATION_ERA[id] === "number" || id in SAVED_WORLD_LEGISLATION_ERA;

  it("keeps every once-dated id in one of the two tables", () => {
    // Saved worlds still hold removed types. Move a removed dated row into
    // SAVED_WORLD_LEGISLATION_ERA, or the law becomes fileable in any year.
    expect(KNOWN_DATED_IDS.filter((id) => !dated(id))).toEqual([]);
  });

  it("lists every dated id in the snapshot", () => {
    // Add new dated ids to datedLegislationIds.snapshot.json so a later
    // removal is caught.
    const known = new Set(KNOWN_DATED_IDS);
    const ids = [
      ...Object.keys(LEGISLATION_ERA).filter((id) => typeof LEGISLATION_ERA[id] === "number"),
      ...Object.keys(SAVED_WORLD_LEGISLATION_ERA),
    ];
    expect(ids.filter((id) => !known.has(id))).toEqual([]);
  });
});
