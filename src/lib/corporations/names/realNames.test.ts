import { describe, expect, it } from "vitest";
import { OPERATING_SECTOR_TYPES } from "@/lib/constants/corporations";
import { REAL_BANK_ENTRIES, REAL_COMPANY_ENTRIES } from "./realCompanies";
import {
  allRealCompanyNames,
  chooseRealCompanyName,
  isRealCompanyWorld,
  realBankNamesFor,
  realCompanyLogoUrl,
  realCompanyNamesFor,
} from "./realNames";

describe("real company names", () => {
  it("lists every company once across countries, industries and banks", () => {
    const names = allRealCompanyNames().map((name) => name.toLowerCase());
    const repeated = names.filter((name, index) => names.indexOf(name) !== index);
    expect(repeated).toEqual([]);
  });

  it("covers every industry for each listed country", () => {
    for (const [countryId, table] of Object.entries(REAL_COMPANY_ENTRIES)) {
      for (const lane of OPERATING_SECTOR_TYPES) {
        expect(table[lane]?.length, `${countryId} ${lane}`).toBeGreaterThanOrEqual(4);
      }
      expect(REAL_BANK_ENTRIES[countryId]?.length, `${countryId} banks`).toBeGreaterThanOrEqual(2);
    }
  });

  it("strips the lookup title from display names", () => {
    expect(realCompanyNamesFor("US", "technology")).toContain("Apple");
    expect(realBankNamesFor("JP")[0]).toBe("MUFG");
  });

  it("fills banks in list order and skips taken names", () => {
    const pick = (existingNames: string[]) =>
      chooseRealCompanyName({
        countryId: "US",
        lane: "financial",
        kind: "bank",
        existingNames,
        rng: () => 0.9,
      });
    expect(pick([])).toBe("JPMorgan Chase");
    expect(pick([" jpmorgan chase "])).toBe("Bank of America");
  });

  it("returns null without a table or once the pool is used up", () => {
    const base = { lane: "energy", kind: "sector", rng: () => 0 } as const;
    expect(chooseRealCompanyName({ ...base, countryId: "BR", existingNames: [] })).toBeNull();
    expect(
      chooseRealCompanyName({
        ...base,
        countryId: "UK",
        existingNames: realCompanyNamesFor("UK", "energy"),
      })
    ).toBeNull();
  });

  it("applies only to modern worlds", () => {
    expect(isRealCompanyWorld(2027)).toBe(true);
    expect(isRealCompanyWorld(1991)).toBe(false);
    expect(isRealCompanyWorld(null)).toBe(false);
  });

  it("ships a logo file for every manifest entry", async () => {
    const { existsSync } = await import("node:fs");
    const named = allRealCompanyNames().filter((name) => realCompanyLogoUrl(name));
    expect(named.length).toBeGreaterThan(allRealCompanyNames().length * 0.6);
    for (const name of named) {
      expect(existsSync(`public${realCompanyLogoUrl(name)}`), name).toBe(true);
    }
  });
});
