import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import { computeCorporationLiabilityValueAnchor } from "../netWorth";
import { imfFacilityPrincipalAnchor } from "@/lib/imf/rules/facilityPrincipal";
import { realizedNetIncomePerTurn, totalCostsPerTurnFromParts } from "./historyFinancials";

describe("settled debt and expense units", () => {
  it("counts mixed-currency loans, arrears and already-anchor IMF principal once", () => {
    const corp = {
      _id: new ObjectId(),
      countryId: "CA" as const,
      liquidCurrencyCode: "CAD" as const,
      imfBailoutActive: true,
      imfFacilityPrincipalOutstanding: 1000,
      operatingCashArrearsByCurrency: { CAD: 200 },
      federalTaxArrearsAnchorByCountry: { CA: 50 },
    };
    const total = computeCorporationLiabilityValueAnchor(
      corp,
      [],
      new Map([
        ["CAD", 2],
        ["JPY", 100],
      ]),
      [
        { outstanding: 2e12, currency: "CAD" },
        { outstanding: 1e12, currency: "JPY" },
      ]
    );
    expect(total).toBe(1.01e12 + 1150);
  });
  it("consolidates retained bond face into anchor principal", () => {
    expect(
      imfFacilityPrincipalAnchor([
        { retainedFace: 2000, localPerAnchor: 2 },
        { retainedFace: 100000, localPerAnchor: 100 },
      ])
    ).toBe(2000);
    expect(() => imfFacilityPrincipalAnchor([{ retainedFace: 10, localPerAnchor: NaN }])).toThrow();
  });
  it("reports actual loan interest separately without treating principal as an expense", () => {
    expect(realizedNetIncomePerTurn({ income: 1000, settledBankLoanInterestPaid: 25 })).toBe(975);
    expect(
      totalCostsPerTurnFromParts({
        totalCosts: 500,
        settledBankLoanInterestPaid: 25,
        settledBondInterestPaid: 10,
      })
    ).toBe(535);
  });
});
