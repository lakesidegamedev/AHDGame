import { describe, expect, it } from "vitest";
import {
  HOUSEHOLD_INCOME_SHARE_OF_GDP_PER_HEAD,
  incomeShareOfGdpPerHead,
  reanchorRegionalMacro,
} from "./reanchorRegionalMacro";

const lira = [
  { id: "N", population: 30_000_000, medianIncome: 9_500_000, gdpGrowth: 4.4 },
  { id: "S", population: 28_000_000, medianIncome: 5_200_000, gdpGrowth: 3.6 },
];
const GDP = 2_390_000_000_000;

describe("reanchorRegionalMacro", () => {
  it("moves legacy-currency incomes onto GDP per head and keeps the regional order", () => {
    const patches = reanchorRegionalMacro({ nationalGdp: GDP, nationalGrowth: 0.6, regions: lira });
    const north = patches.find((p) => p.id === "N")!;
    const south = patches.find((p) => p.id === "S")!;
    expect(north.medianIncome!).toBeGreaterThan(south.medianIncome!);
    const share = incomeShareOfGdpPerHead(
      GDP,
      lira.map((r) => ({ ...r, medianIncome: patches.find((p) => p.id === r.id)!.medianIncome! }))
    );
    expect(share).toBeCloseTo(HOUSEHOLD_INCOME_SHARE_OF_GDP_PER_HEAD, 2);
  });

  it("shifts regional growth to the national figure and keeps regional gaps", () => {
    const patches = reanchorRegionalMacro({ nationalGdp: GDP, nationalGrowth: 0.6, regions: lira });
    const north = patches.find((p) => p.id === "N")!.gdpGrowth!;
    const south = patches.find((p) => p.id === "S")!.gdpGrowth!;
    expect(north - south).toBeCloseTo(0.8, 2);
    expect((north * 30 + south * 28) / 58).toBeCloseTo(0.6, 1);
  });

  it("leaves plausible incomes and close growth alone", () => {
    const regions = [
      { id: "A", population: 5_000_000, medianIncome: 42_000, gdpGrowth: 3.1 },
      { id: "B", population: 600_000, medianIncome: 36_000, gdpGrowth: 2.9 },
    ];
    expect(
      reanchorRegionalMacro({ nationalGdp: 600_000_000_000, nationalGrowth: 3.3, regions })
    ).toEqual([]);
  });

  it("does nothing without a national GDP or regions", () => {
    expect(reanchorRegionalMacro({ nationalGdp: 0, nationalGrowth: 1, regions: lira })).toEqual([]);
    expect(reanchorRegionalMacro({ nationalGdp: GDP, nationalGrowth: 1, regions: [] })).toEqual([]);
  });
});
