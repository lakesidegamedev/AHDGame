import { describe, expect, it } from "vitest";
import { COUNTRY_CONFIGS } from "@/lib/constants/countries";
import { resolveHouseholdResources } from "./householdResources";
import {
  HOUSEHOLD_REFERENCE_INPUTS,
  resolveHouseholdCountry,
  type HouseholdCountryCoverage,
} from "./householdReadiness";

function fixture(countryId = "UK") {
  const readings = ["a", "b"].map((regionId) =>
    resolveHouseholdResources({
      countryId,
      regionId,
      currency: "fixture",
      priceBaseYear: 1991,
      measurementTurn: 10,
      consumerPriceIndex: 100,
      groups: [
        {
          id: "households",
          households: 10,
          adults: 2,
          children: 1,
          marketIncome: 100,
          paidCashTransfers: 20,
          directTaxes: 10,
          employeeContributions: 5,
        },
      ],
    })
  );
  // Mock reference evidence exercises the boundary. No real country is activated.
  const coverage: HouseholdCountryCoverage = {
    countryId,
    currency: "fixture",
    priceBaseYear: 1991,
    measurementTurn: 10,
    regions: [
      { regionId: "a", householdResidents: 30 },
      { regionId: "b", householdResidents: 30 },
    ],
    references: Object.fromEntries(
      HOUSEHOLD_REFERENCE_INPUTS.map((key) => [
        key,
        { basis: "reference", sourceId: `fixture:${key}` },
      ])
    ),
    reconciliation: {
      sourceId: "fixture-ledger",
      countryId,
      currency: "fixture",
      measurementTurn: 10,
      marketIncome: 2000,
      paidCashTransfers: 400,
      directTaxes: 200,
      employeeContributions: 100,
    },
  };
  const existing = { value: 19, observedAtTurn: 4, note: "existing estimate" };
  return { existing, coverage, readings };
}

describe("reference-only household country activation", () => {
  it("accepts complete compatible reference coverage and reconciled flows", () => {
    const result = resolveHouseholdCountry(fixture());
    expect(result.path).toBe("household-resources");
    expect(result.gaps).toEqual([]);
  });
  it.each(HOUSEHOLD_REFERENCE_INPUTS)(
    "keeps existing calculations when %s is missing or synthetic",
    (key) => {
      for (const basis of [undefined, "synthetic"] as const) {
        const input = fixture();
        input.coverage.references[key] = basis
          ? { basis, sourceId: "calibrated-fixture" }
          : undefined;
        const result = resolveHouseholdCountry(input);
        expect(result.path).toBe("existing");
        expect(result.value).toBe(input.existing);
        expect(result.gaps).toContain(`missing-reference:${key}`);
      }
    }
  );
  it("does not aggregate only the available regions into a new national definition", () => {
    const input = fixture();
    input.readings.pop();
    expect(resolveHouseholdCountry(input).gaps).toContain("incomplete-regional-coverage");
  });
  it("rejects duplicate, extra and population-incomplete regional coverage", () => {
    for (const change of [
      (x: ReturnType<typeof fixture>) => {
        x.readings[1] = x.readings[0]!;
      },
      (x: ReturnType<typeof fixture>) => {
        x.readings[1] = { ...x.readings[1]!, regionId: "extra" };
      },
      (x: ReturnType<typeof fixture>) => {
        x.coverage.regions = [
          { regionId: "a", householdResidents: 31 },
          { regionId: "b", householdResidents: 30 },
        ];
      },
    ]) {
      const input = fixture();
      change(input);
      expect(resolveHouseholdCountry(input).gaps).toContain("incomplete-regional-coverage");
    }
  });
  it("requires same-country, same-window, same-currency and same-price-base inputs", () => {
    for (const patch of [
      { countryId: "JP" },
      { measurementTurn: 9 },
      { currency: "other" },
      { priceBaseYear: 2020 },
    ]) {
      const input = fixture();
      input.readings[0] = { ...input.readings[0]!, ...patch };
      expect(resolveHouseholdCountry(input).gaps).toContain("incompatible-measurement");
    }
  });
  it("requires fiscal reconciliation, not just a positive implementation factor", () => {
    const input = fixture();
    input.coverage.reconciliation!.paidCashTransfers = 10000;
    expect(resolveHouseholdCountry(input).gaps).toContain("unreconciled-resources");
    input.coverage.reconciliation = undefined;
    expect(resolveHouseholdCountry(input).gaps).toContain("unreconciled-resources");
  });
  it("does not accept stale or cross-country fiscal control totals", () => {
    for (const patch of [{ countryId: "JP" }, { currency: "other" }, { measurementTurn: 9 }]) {
      const input = fixture();
      Object.assign(input.coverage.reconciliation!, patch);
      expect(resolveHouseholdCountry(input).gaps).toContain("unreconciled-resources");
    }
  });
  it.each(Object.keys(COUNTRY_CONFIGS))(
    "leaves %s unchanged with no reviewed household inputs",
    (countryId) => {
      const input = fixture(countryId);
      input.coverage.references = {};
      const result = resolveHouseholdCountry(input);
      expect(result.path).toBe("existing");
      expect(result.value).toBe(input.existing);
      expect(result.value).toEqual({ value: 19, observedAtTurn: 4, note: "existing estimate" });
    }
  );
});
