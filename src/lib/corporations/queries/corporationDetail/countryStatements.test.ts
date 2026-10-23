import { describe, expect, it } from "vitest";
import { buildCountryStatements, type CountryOperatingTotals } from "./countryStatements";

const ops = (over: Partial<CountryOperatingTotals> = {}): CountryOperatingTotals => ({
  sectorCount: 1,
  revenue: 0,
  freightIncome: 0,
  maintenance: 0,
  labor: 0,
  freightCosts: 0,
  growthCosts: 0,
  regulatoryBurden: 0,
  ...over,
});

describe("buildCountryStatements", () => {
  it("lists countries largest revenue first", () => {
    const rows = buildCountryStatements(
      { US: ops({ revenue: 100 }), UK: ops({ revenue: 300 }), JP: ops({ revenue: 200 }) },
      {}
    );
    expect(rows.map((r) => r.countryId)).toEqual(["UK", "JP", "US"]);
  });

  it("shows maintenance net of wages, as the main statement does", () => {
    const [row] = buildCountryStatements({ US: ops({ maintenance: 500, labor: 200 }) }, {});
    expect(row.maintenanceCosts).toBe(300);
    expect(row.laborCosts).toBe(200);
  });

  it("takes each country's own tax and nets everything into a result", () => {
    const [row] = buildCountryStatements(
      {
        UK: ops({
          sectorCount: 4,
          revenue: 1_000,
          freightIncome: 50,
          maintenance: 400,
          labor: 150,
          freightCosts: 60,
          growthCosts: 10,
          regulatoryBurden: 20,
        }),
      },
      { UK: { federal: 40, state: 15 } }
    );
    expect(row).toMatchObject({
      countryId: "UK",
      sectorCount: 4,
      revenue: 1_000,
      freightIncome: 50,
      maintenanceCosts: 250,
      laborCosts: 150,
      freightCosts: 60,
      growthCosts: 10,
      regulatoryBurden: 20,
      federalTax: 40,
      stateTax: 15,
      // Freight income is already inside revenue, as on the main statement:
      // 1000 - (250 + 150 + 60 + 10 + 20) - (40 + 15)
      result: 455,
    });
  });

  it("charges no tax to a country with none recorded", () => {
    const [row] = buildCountryStatements(
      { JP: ops({ revenue: 100 }) },
      { US: { federal: 9, state: 1 } }
    );
    expect(row.federalTax).toBe(0);
    expect(row.stateTax).toBe(0);
    expect(row.result).toBe(100);
  });

  it("rounds to whole units and skips non-finite figures", () => {
    const [row] = buildCountryStatements(
      { US: ops({ revenue: 10.6, maintenance: Number.NaN }) },
      { US: { federal: 0.4, state: Number.POSITIVE_INFINITY } }
    );
    expect(row.revenue).toBe(11);
    expect(row.maintenanceCosts).toBe(0);
    expect(row.stateTax).toBe(0);
    expect(row.result).toBe(11);
  });
});
