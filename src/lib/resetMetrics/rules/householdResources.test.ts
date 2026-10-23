import { describe, expect, it } from "vitest";
import {
  allocateHouseholdCash,
  householdResourceOutcomes,
  resolveHouseholdResources,
  type HouseholdResourceGroup,
} from "./householdResources";

const group = (id: string, income: number, households = 1): HouseholdResourceGroup => ({
  id,
  households,
  adults: 1,
  children: 0,
  marketIncome: income,
  paidCashTransfers: 0,
  directTaxes: 0,
  employeeContributions: 0,
});
const reading = (
  regionId: string,
  groups: HouseholdResourceGroup[],
  countryId = "UK",
  consumerPriceIndex = 100
) =>
  resolveHouseholdResources({
    regionId,
    countryId,
    currency: countryId,
    priceBaseYear: 1991,
    measurementTurn: 10,
    consumerPriceIndex,
    groups,
  });

describe("shared household resource owner", () => {
  it("reconciles income, paid cash, taxes and contributions exactly", () => {
    const result = reading("a", [
      {
        ...group("family", 10000, 50),
        adults: 2,
        children: 2,
        paidCashTransfers: 2000,
        directTaxes: 1000,
        employeeContributions: 500,
      },
    ]);
    expect(result.totals.people).toBe(200);
    expect(result.totals.disposableIncome).toBe(525000);
    expect(result.totals.disposableIncome).toBe(
      result.totals.marketIncome +
        result.totals.paidCashTransfers -
        result.totals.directTaxes -
        result.totals.employeeContributions
    );
    expect(result.cells[0]!.equivalisedDisposableIncome).toBe(5250);
  });
  it("uses the national threshold in richer and poorer regions", () => {
    const result = householdResourceOutcomes([
      reading("poor", [group("p", 20)]),
      reading("rich", [group("r", 100, 3)]),
    ]);
    expect(result.median).toBe(100);
    expect(result.threshold50).toBe(50);
    expect(result.poverty50.rate).toBe(25);
    expect(result.poverty50.gap).toBe(15);
    expect(result.regions[0]!.poverty50.rate).toBe(100);
    expect(result.regions[1]!.poverty50.rate).toBe(0);
    expect(result.gini).toBeCloseTo(18.75);
  });
  it("does not confuse household weights with person weights", () => {
    const family = { ...group("family", 400), adults: 2, children: 2 };
    const result = householdResourceOutcomes([reading("a", [family, group("single", 100)])]);
    expect(result.median).toBe(200);
  });
  it("uses prices for real purchasing power, not the nominal poverty threshold", () => {
    const a = householdResourceOutcomes([
      reading("a", [group("low", 20), group("middle", 100, 2)]),
    ]);
    const b = householdResourceOutcomes([
      reading("a", [group("low", 20), group("middle", 100, 2)], "UK", 200),
    ]);
    expect(b.threshold50).toBe(a.threshold50);
    expect(b.realMedian).toBe(a.realMedian / 2);
    expect(b.poverty50).toEqual(a.poverty50);
  });
  it("retains a separately defined anchored real poverty companion", () => {
    const groups = [group("low", 40), group("middle", 100, 2)];
    const anchor = { realThreshold: 50, priceBaseYear: 1991 };
    const before = householdResourceOutcomes([reading("a", groups)], anchor);
    const after = householdResourceOutcomes(
      [
        reading(
          "a",
          groups.map((g) => ({ ...g, marketIncome: g.marketIncome * 2 }))
        ),
      ],
      anchor
    );
    expect(after.poverty50.rate).toBe(before.poverty50.rate);
    expect(before.anchoredPoverty!.rate).toBeCloseTo(100 / 3);
    expect(after.anchoredPoverty!.rate).toBe(0);
    expect(() =>
      householdResourceOutcomes([reading("a", groups)], { ...anchor, priceBaseYear: 2020 })
    ).toThrow("anchor");
  });
  it("relative poverty and Gini do not fall simply because everyone's income doubles", () => {
    const inputs = [group("poor", 20), group("middle", 100), group("rich", 200)];
    const a = householdResourceOutcomes([reading("a", inputs)]);
    const b = householdResourceOutcomes([
      reading(
        "a",
        inputs.map((g) => ({ ...g, marketIncome: g.marketIncome * 2 }))
      ),
    ]);
    expect(b.poverty50).toEqual(a.poverty50);
    expect(b.gini).toBe(a.gini);
    expect(b.realMedian).toBe(a.realMedian * 2);
  });
  it.each(["US", "UK", "JP", "IE", "SCO", "WAL", "DE", "BR", "RU", "CN"])(
    "paid targeted relief affects outcomes in %s",
    (country) => {
      const baseline = [group("poor", 20), group("middle", 100, 2), group("rich", 200)];
      const before = householdResourceOutcomes([reading("a", baseline, country)]);
      const after = householdResourceOutcomes([
        reading(
          "a",
          baseline.map((g) => ({
            ...g,
            paidCashTransfers: g.id === "poor" ? 40 : 0,
            directTaxes: g.id === "rich" ? 40 : 0,
          })),
          country
        ),
      ]);
      expect(before.poverty50.rate).toBe(25);
      expect(after.poverty50.rate).toBe(0);
      expect(after.gini!).toBeLessThan(before.gini!);
      expect(after.median).toBe(before.median);
    }
  );
  it("does not present an all-zero income distribution as measured zero poverty", () => {
    const result = householdResourceOutcomes([reading("a", [group("all", 0)])]);
    expect(result.poverty50.rate).toBeNull();
    expect(result.gini).toBeNull();
  });
  it("rejects incompatible countries, currencies, windows and duplicate regions", () => {
    const a = reading("a", [group("all", 100)]);
    for (const b of [
      a,
      { ...a, regionId: "b", countryId: "JP" },
      { ...a, regionId: "b", currency: "JPY" },
      { ...a, regionId: "b", measurementTurn: 9 },
      { ...a, regionId: "b", priceBaseYear: 2020 },
    ])
      expect(() => householdResourceOutcomes([a, b])).toThrow("compatible");
  });
  it("fails closed on invalid cash, deductions and household composition", () => {
    for (const g of [
      { ...group("x", 10), paidCashTransfers: -1 },
      { ...group("x", 10), directTaxes: 11 },
      { ...group("x", 10), adults: 0 },
      { ...group("x", 10), children: Number.NaN },
    ])
      expect(() => reading("a", [g])).toThrow();
  });
  it("allocates only confirmed cash and conserves the payment pool", () => {
    const recipients = [
      { id: "poor", households: 10, eligibility: 1 },
      { id: "middle", households: 20, eligibility: 0.5 },
      { id: "rich", households: 10, eligibility: 0 },
    ];
    const result = allocateHouseholdCash({ paidPool: 100, recipients });
    expect(result.allocations.map((a) => a.perHousehold)).toEqual([5, 2.5, 0]);
    expect(
      result.allocations.reduce((sum, a, i) => sum + a.perHousehold * recipients[i]!.households, 0)
    ).toBe(100);
    expect(result.unallocated).toBe(0);
    expect(allocateHouseholdCash({ paidPool: 100, recipients: [] }).unallocated).toBe(100);
  });
});
