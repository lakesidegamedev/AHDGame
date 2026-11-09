import { describe, expect, it } from "vitest";
import {
  getDemographicCategoriesForCountry,
  resolveCanvassGroup,
  getAllDemographicCategoryKeys,
} from "./countryDemographics";

describe("countryDemographics SSOT", () => {
  it("returns a single jp_voterGroups category for JP with seed groups", () => {
    const cats = getDemographicCategoriesForCountry("JP");
    expect(cats).toHaveLength(1);
    expect(cats[0].key).toBe("jp_voterGroups");
    const ids = cats[0].groups.map((g) => g.id);
    expect(ids).toContain("komeito_faithful");
    expect(ids).toContain("salaryman_conservative");
  });

  it("returns the correct <cc>_voterGroups key for every voter-group country", () => {
    for (const [country, key] of [
      ["UK", "uk_voterGroups"],
      ["JP", "jp_voterGroups"],
      ["DE", "de_voterGroups"],
      ["IE", "ie_voterGroups"],
      ["CN", "cn_voterGroups"],
      ["BR", "br_voterGroups"],
      ["DD", "dd_voterGroups"],
    ] as const) {
      const cats = getDemographicCategoriesForCountry(country);
      expect(cats).toHaveLength(1);
      expect(cats[0].key).toBe(key);
      expect(cats[0].groups.length).toBeGreaterThan(0);
    }
  });

  it("returns 5 US categories including ideology for US (and unknown countries)", () => {
    for (const country of ["US", "ZZ", undefined as unknown as string]) {
      const cats = getDemographicCategoriesForCountry(country);
      const keys = cats.map((c) => c.key);
      expect(keys).toEqual(["race", "age", "education", "wealth", "ideology"]);
    }
  });

  it("carries seed leans through to CanvassGroup", () => {
    const cats = getDemographicCategoriesForCountry("JP");
    const komeito = cats[0].groups.find((g) => g.id === "komeito_faithful")!;
    expect(komeito.economicLean).toBe(0);
    expect(komeito.socialLean).toBe(0);
  });

  it("resolveCanvassGroup accepts a valid country pair and returns leans + key", () => {
    const r = resolveCanvassGroup("JP", "jp_voterGroups", "komeito_faithful");
    expect(r).toEqual({ economicLean: 0, socialLean: 0, categoryKey: "jp_voterGroups" });
  });

  it("resolveCanvassGroup rejects a cross-country group id", () => {
    // new_britons is a UK group, not a JP group
    expect(resolveCanvassGroup("JP", "jp_voterGroups", "new_britons")).toBeNull();
    // wrong category key for the country
    expect(resolveCanvassGroup("JP", "uk_voterGroups", "komeito_faithful")).toBeNull();
  });

  it("resolveCanvassGroup validates US category+group pairs", () => {
    expect(resolveCanvassGroup("US", "race", "white")).toEqual({
      economicLean: 1,
      socialLean: 1,
      categoryKey: "race",
    });
    expect(resolveCanvassGroup("US", "race", "komeito_faithful")).toBeNull();
  });
});

describe("getAllDemographicCategoryKeys", () => {
  it("spans US Layer-1 dimensions + every country's <cc>_voterGroups bucket", () => {
    const keys = getAllDemographicCategoryKeys();
    for (const expected of [
      "race",
      "age",
      "education",
      "wealth",
      "ideology",
      "uk_voterGroups",
      "jp_voterGroups",
      "de_voterGroups",
      "ie_voterGroups",
      "cn_voterGroups",
      "br_voterGroups",
      "dd_voterGroups",
    ]) {
      expect(keys, `missing category key "${expected}"`).toContain(expected);
    }
  });

  it("is deduplicated", () => {
    const keys = getAllDemographicCategoryKeys();
    expect(new Set(keys).size).toBe(keys.length);
  });
});
