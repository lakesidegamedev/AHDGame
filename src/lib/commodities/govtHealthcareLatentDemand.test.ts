import { describe, expect, it } from "vitest";
import { GOVT_HEALTHCARE_DEMAND_RATE } from "@/lib/constants/commodities";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { budgetFxRateForCountry, govtHealthcareLatentUnits } from "./govtHealthcareLatentDemand";

const fxByCurrency = new Map<CurrencyCode, number>([
  ["USD", 1],
  ["JPY", 100],
]);
const fxRateForCountry = (countryId: string) =>
  budgetFxRateForCountry(countryId, fxByCurrency, "modern");

describe("govtHealthcareLatentUnits", () => {
  it("converts equivalent US and Japanese budgets to the same anchor demand", () => {
    const us = { countryId: "US", spending: { byCategory: { healthcare: 4_800 } } };
    const jp = { countryId: "JP", spending: { byCategory: { health: 480_000 } } };
    const basePrice = 10;
    const unitsPerBudget = (4_800 / 48 / basePrice) * GOVT_HEALTHCARE_DEMAND_RATE;

    expect(govtHealthcareLatentUnits([us], basePrice, fxRateForCountry)).toBeCloseTo(
      unitsPerBudget
    );
    expect(govtHealthcareLatentUnits([jp], basePrice, fxRateForCountry)).toBeCloseTo(
      unitsPerBudget
    );
    expect(govtHealthcareLatentUnits([us, jp], basePrice, fxRateForCountry)).toBeCloseTo(
      2 * unitsPerBudget
    );
  });

  it("counts less anchor demand for the same face value in a weaker currency", () => {
    const spending = { byCategory: { healthcare: 480_000 } };
    const usUnits = govtHealthcareLatentUnits(
      [{ countryId: "US", spending }],
      10,
      fxRateForCountry
    );
    const jpUnits = govtHealthcareLatentUnits(
      [{ countryId: "JP", spending }],
      10,
      fxRateForCountry
    );

    expect(jpUnits).toBeCloseTo(usUnits / 100);
  });

  it("ignores budgets without positive healthcare spending", () => {
    expect(
      govtHealthcareLatentUnits(
        [
          { countryId: "US" },
          { countryId: "JP", spending: { byCategory: {} } },
          { countryId: "US", spending: { byCategory: { defense: 4_800 } } },
          { countryId: "JP", spending: { byCategory: { health: -4_800 } } },
        ],
        10,
        fxRateForCountry
      )
    ).toBe(0);
    expect(govtHealthcareLatentUnits([], 10, fxRateForCountry)).toBe(0);
  });
});
