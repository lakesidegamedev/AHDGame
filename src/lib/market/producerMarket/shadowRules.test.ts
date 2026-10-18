import { describe, expect, it } from "vitest";
import type { ProductionPlan } from "./production";
import { publicOrders, runProducerShadow } from "./shadowRules";

// A plant with no inputs selling financial services at 3, paying 20 wages to households.
const plan = (id: string, changes: Partial<ProductionPlan> = {}): ProductionPlan => ({
  id,
  accountId: `corp-${id}`,
  capacityUnits: 100,
  activeFraction: 1,
  outputMultiplier: 1,
  labourCost: 20,
  otherOperatingCost: 10,
  labourRecipientAccountId: "households",
  operatingRecipientAccountId: "services",
  inputs: [],
  outputs: [
    {
      commodity: "financial_services",
      unitsPerOutput: 1,
      book: "world",
      policy: { kind: "manual", unitPrice: 3 },
      referenceUnitPrice: 3,
      storable: false,
    },
  ],
  inputStock: [],
  outputStock: [],
  ...changes,
});

const base = {
  turn: 1,
  skipped: 0,
  accounts: [
    { id: "corp-a", cash: 100 },
    { id: "households", cash: 0 },
    { id: "services", cash: 0 },
    { id: "public-us", cash: 0 },
  ],
};

describe("producer market shadow", () => {
  it("households with no cash beyond wages cannot buy everything a plant makes", () => {
    const s = runProducerShadow({
      ...base,
      producers: [
        { plan: plan("a"), sectorType: "financial", legacy: { revenue: 300, profit: 50 } },
      ],
      households: [
        {
          accountId: "households",
          spendFraction: 1,
          products: [
            { commodity: "financial_services", book: "world", maximumUnitPrice: 3, weight: 1 },
          ],
        },
      ],
      publicOrders: [],
    });
    const fin = s.industries[0];
    expect(fin.legacyRevenue).toBe(300);
    // Only the 20 of wages paid into the wallet can come back as sales.
    expect(fin.shadowRevenue).toBeLessThanOrEqual(20 + 1e-9);
    expect(s.householdSpend).toBeGreaterThan(0);
    expect(s.shadowLosingShare).toBe(1);
  });

  it("funded households and public buyers restore sales", () => {
    const s = runProducerShadow({
      ...base,
      accounts: base.accounts.map((a) =>
        a.id === "households" ? { ...a, cash: 200 } : a.id === "public-us" ? { ...a, cash: 100 } : a
      ),
      producers: [
        { plan: plan("a"), sectorType: "financial", legacy: { revenue: 300, profit: 50 } },
      ],
      households: [
        {
          accountId: "households",
          spendFraction: 1,
          products: [
            { commodity: "financial_services", book: "world", maximumUnitPrice: 3, weight: 1 },
          ],
        },
      ],
      publicOrders: publicOrders(
        [
          {
            accountId: "public-us",
            lines: [{ commodity: "financial_services", book: "world", amountLocal: 100 }],
          },
        ],
        () => 3,
        1
      ),
    });
    expect(s.industries[0].shadowRevenue).toBeCloseTo(300, 6);
    expect(s.shadowLosingShare).toBe(0);
    expect(s.publicSpend).toBeGreaterThan(0);
  });

  it("a glutted world book sets a lower next reference price", () => {
    const s = runProducerShadow({
      ...base,
      references: { financial_services: 3 },
      producers: [{ plan: plan("a"), sectorType: "financial", legacy: null }],
      households: [
        {
          accountId: "households",
          spendFraction: 1,
          products: [
            { commodity: "financial_services", book: "world", maximumUnitPrice: 3, weight: 1 },
          ],
        },
      ],
      publicOrders: [],
    });
    const fin = s.nextPrices.find((p) => p.commodity === "financial_services")!;
    expect(fin.unsoldUnits).toBeGreaterThan(0);
    expect(fin.next).toBeLessThan(3);
  });
});
