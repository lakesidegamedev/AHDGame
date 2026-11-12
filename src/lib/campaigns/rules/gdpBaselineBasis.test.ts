import { describe, expect, it } from "vitest";
import {
  campaignGdpPerCapitaIndex,
  eraGdpPerCapitaIndex,
  gdpBaselinePerCapita,
  requireNationalGdpPerCapita,
} from "./gdpBaseline";
import { getIncomeGdpScalar } from "@/lib/utils/fundGeneration";

const grown = [
  { countryId: "US", gdp: 30_000_000, population: 300_000_000 },
  { countryId: "UK", gdp: 5_000_000, population: 60_000_000 },
  { countryId: "ZZ", gdp: 1, population: 1 },
];

describe("campaign GDP basis switch", () => {
  it("prices against the era table when the world's campaign money does not follow live GDP", () => {
    const index = campaignGdpPerCapitaIndex(grown, { live: false, preset: "1991-default" });
    expect(index.get("US")).toBe(gdpBaselinePerCapita("US", "1991-default"));
    expect(index.get("UK")).toBe(gdpBaselinePerCapita("UK", "1991-default"));
    // The scalar a running world pays is the one it paid before campaign money followed GDP.
    const perCapita = requireNationalGdpPerCapita(index, "US");
    expect(getIncomeGdpScalar(1_000, 10_000_000, "US", "1991-default", perCapita)).toBe(
      getIncomeGdpScalar(1_000, 10_000_000, "US", "1991-default")
    );
  });

  it("leaves out countries the era table has no row for, so pricing one still refuses", () => {
    const index = campaignGdpPerCapitaIndex(grown, { live: false, preset: "1991-default" });
    expect(index.has("ZZ")).toBe(false);
    expect(() => requireNationalGdpPerCapita(index, "ZZ")).toThrow();
  });

  it("follows live GDP per capita when the switch is on", () => {
    const index = campaignGdpPerCapitaIndex(grown, { live: true, preset: "1991-default" });
    expect(index.get("US")).toBeCloseTo((30_000_000 * 1_000_000) / 300_000_000, 6);
  });

  it("lists each country once", () => {
    expect([...eraGdpPerCapitaIndex(["US", "US", "UK"], "2027-default").keys()]).toEqual([
      "US",
      "UK",
    ]);
  });
});
