import { describe, expect, it } from "vitest";
import { householdAdapterFixture } from "../testing/householdAdapterFixture";
import {
  adaptHouseholdCountry,
  type HouseholdCountryAdapterInput,
} from "./householdCountryAdapter";
import { householdPublication } from "./householdPublication";

describe("household country adapter qualification", () => {
  it.each(["US", "UK", "JP"] as const)(
    "prepares compatible %s owner inputs without mutation",
    (country) => {
      const input = householdAdapterFixture(country);
      const before = structuredClone(input);
      const result = adaptHouseholdCountry(input);
      expect(result.path).toBe("prepared");
      expect(input).toEqual(before);
      if (result.path === "prepared") {
        expect(result.source.inputs).toHaveLength(2);
        expect(result.source.inputs[0]!.groups[0]!.marketIncome).toBe(20);
      }
    }
  );

  it("normalizes Japan monthly thousand-yen flows and scaled household weights once", () => {
    const input = householdAdapterFixture("JP");
    input.extract!.period = "monthly";
    input.extract!.moneyUnit = "thousands";
    input.extract!.weightDivisor = 100;
    input.extract!.rows = input.extract!.rows.map((r) => ({
      ...r,
      households: r.households * 100,
      marketIncome: r.marketIncome / 12000,
      paidCashTransfers: r.paidCashTransfers / 12000,
    }));
    const result = adaptHouseholdCountry(input);
    expect(result.path).toBe("prepared");
    if (result.path === "prepared") {
      expect(result.source.inputs[0]!.groups[0]!.marketIncome).toBeCloseTo(20);
      expect(result.source.inputs[0]!.groups[0]!.households).toBe(1);
    }
  });

  it("keeps annual thousand-yen income separate from monthly yen cash items", () => {
    const input = householdAdapterFixture("JP");
    input.extract!.period = "monthly";
    input.extract!.flowUnits = { marketIncome: { period: "annual", moneyUnit: "thousands" } };
    input.extract!.rows = input.extract!.rows.map((r) => ({
      ...r,
      marketIncome: r.marketIncome / 1000,
      paidCashTransfers: r.paidCashTransfers / 12,
    }));
    const result = adaptHouseholdCountry(input);
    expect(result.path).toBe("prepared");
    if (result.path !== "prepared") return;
    expect(result.source.inputs[0]!.groups[0]!.marketIncome).toBe(20);
    expect(result.source.inputs[0]!.groups[0]!.paidCashTransfers).toBe(48);
  });
  const mutations: [string, (x: HouseholdCountryAdapterInput) => void][] = [
    [
      "incompatible basket base year",
      (x) => {
        x.extract!.priceBaseYear = 2020;
      },
    ],
    [
      "missing extract",
      (x) => {
        x.extract = undefined;
      },
    ],
    [
      "wrong country",
      (x) => {
        x.extract!.countryId = "US";
      },
    ],
    [
      "missing source",
      (x) => {
        x.extract!.sourceId = "";
      },
    ],
    [
      "future 1994 table in a 1991 world",
      (x) => {
        x.extract!.incomeYear = 1994;
      },
    ],
    [
      "national decile means",
      (x) => {
        x.extract!.distribution = "marginal-means";
      },
    ],
    [
      "average composition",
      (x) => {
        x.extract!.composition = "group-averages";
      },
    ],
    [
      "worker households only",
      (x) => {
        x.extract!.population = "workers-only";
      },
    ],
    [
      "single-person households absent",
      (x) => {
        x.extract!.population = "multi-person-only";
      },
    ],
    [
      "already equivalised ONS income",
      (x) => {
        x.extract!.equivalisation = "modified-oecd";
      },
    ],
    [
      "historical survey without a current owner",
      (x) => {
        x.extract!.currentOwner = undefined;
      },
    ],
    [
      "stale owner",
      (x) => {
        x.extract!.currentOwner!.measurementTurn--;
      },
    ],
    [
      "wrong world",
      (x) => {
        x.extract!.currentOwner!.worldId = "other";
      },
    ],
    [
      "wrong currency",
      (x) => {
        x.extract!.currency = "USD";
      },
    ],
    [
      "zero weight scale",
      (x) => {
        x.extract!.weightDivisor = 0;
      },
    ],
    [
      "one area split between regions",
      (x) => {
        x.extract!.geography = [x.extract!.geography[0]!, x.extract!.geography[0]!];
      },
    ],
    [
      "missing area",
      (x) => {
        x.extract!.rows = x.extract!.rows.slice(3);
      },
    ],
    [
      "unknown area",
      (x) => {
        x.extract!.rows = x.extract!.rows.map((r) => ({ ...r, sourceArea: "unknown" }));
      },
    ],
    [
      "missing current fiscal controls",
      (x) => {
        x.coverage.reconciliation = undefined;
      },
    ],
    [
      "incorrect fiscal controls",
      (x) => {
        x.coverage.reconciliation!.marketIncome++;
      },
    ],
    [
      "negative market income",
      (x) => {
        x.extract!.rows = x.extract!.rows.map((r) => ({ ...r, marketIncome: -1 }));
      },
    ],
    [
      "missing financial field",
      (x) => {
        x.extract!.rows = x.extract!.rows.map((r) => ({ ...r, directTaxes: NaN }));
      },
    ],
    [
      "duplicate household record",
      (x) => {
        x.extract!.rows = [...x.extract!.rows, x.extract!.rows[0]!];
      },
    ],
  ];
  it.each(mutations)("keeps legacy for %s without dropping records", (_, mutate) => {
    const input = householdAdapterFixture();
    mutate(input);
    const before = structuredClone(input);
    const result = adaptHouseholdCountry(input);
    expect(result.path).toBe("legacy");
    expect(result.gaps.length).toBeGreaterThan(0);
    expect(input).toEqual(before);
  });
  it("does not activate an unreviewed country through a US adapter", () => {
    const input = householdAdapterFixture();
    input.countryId = "DE";
    expect(adaptHouseholdCountry(input)).toEqual({ path: "legacy", gaps: ["unsupported-country"] });
  });
  it("does not treat the acquired national ONS decile means as regional household records", () => {
    const input = householdAdapterFixture("UK");
    input.extract!.sourceId = "ons-effects-taxes-benefits-1991";
    input.extract!.distribution = "marginal-means";
    input.extract!.composition = "group-averages";
    input.extract!.equivalisation = "modified-oecd";
    input.extract!.currentOwner = undefined;
    const result = adaptHouseholdCountry(input);
    expect(result.path).toBe("legacy");
    expect(result.gaps).toEqual(
      expect.arrayContaining([
        "marginal-distribution",
        "averaged-composition",
        "incompatible-equivalisation",
        "historical-only",
      ])
    );
  });
  it("does not use Japan's multi-person 1994 table as the entire 1991 population", () => {
    const input = householdAdapterFixture("JP");
    input.extract!.sourceId = "estat-0000110457";
    input.extract!.incomeYear = 1994;
    input.extract!.population = "multi-person-only";
    input.extract!.distribution = "marginal-means";
    input.extract!.currentOwner = undefined;
    const result = adaptHouseholdCountry(input);
    expect(result.path).toBe("legacy");
    expect(result.gaps).toEqual(
      expect.arrayContaining([
        "future-vintage",
        "incomplete-population",
        "marginal-distribution",
        "historical-only",
      ])
    );
  });
  it("preparation cannot bypass actual-law funding checks", () => {
    const input = householdAdapterFixture();
    const result = adaptHouseholdCountry(input);
    expect(result.path).toBe("prepared");
    if (result.path !== "prepared") return;
    expect(
      householdPublication({
        worldId: input.worldId,
        countryId: input.countryId,
        turn: input.turn,
        regionIds: input.coverage.regions.map((r) => r.regionId),
        source: result.source,
        programs: [
          {
            _id: "cash-law",
            country: "UK",
            scope: "national",
            familyId: "L01",
            fundingAccountId: "test-account",
            effectiveTurn: 1,
            primaryMetricEffects: [],
          },
        ],
        settlements: new Map(),
      }).size
    ).toBe(0);
  });
});
