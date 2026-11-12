import { describe, expect, it } from "vitest";
import {
  sovereignIssuanceFlowsByCountry,
  reconcileSovereignDebtFaceFlows,
} from "./sovereignProceeds";

describe("sovereign cash proceeds", () => {
  it.each([
    { openingDebt: 100, closingDebt: 100, issuedFace: 30, issued: 30, retired: 30 },
    { openingDebt: 100, closingDebt: 100, issuedFace: 0, issued: 0, retired: 0 },
    { openingDebt: 100, closingDebt: 70, issuedFace: 0, issued: 0, retired: 30 },
    { openingDebt: 100, closingDebt: 120, issuedFace: 10, issued: 20, retired: 0 },
  ])(
    "reconciles cash refinancing and in-kind exchanges to bond-owned principal",
    ({ issued, retired, ...input }) => {
      expect(reconcileSovereignDebtFaceFlows(input)).toEqual({
        issuedFace: issued,
        retiredFace: retired,
      });
    }
  );
  it("rejects invalid canonical principal", () => {
    expect(() =>
      reconcileSovereignDebtFaceFlows({ openingDebt: 100, closingDebt: NaN, issuedFace: 0 })
    ).toThrow();
  });
  it("adds at-par issues and actual old/new placement consideration once", () => {
    expect(
      sovereignIssuanceFlowsByCountry({
        atParIssues: [{ countryId: "US", face: 25_000 }],
        placements: [
          { countryId: "US", face: 14_000, cashPaid: 14_280 },
          { countryId: "UK", face: 10_000, cashPaid: 9_800 },
        ],
      })
    ).toEqual({ US: { cash: 39_280, face: 39_000 }, UK: { cash: 9_800, face: 10_000 } });
  });

  it("rejects negative, nonfinite, and unsafe proceeds", () => {
    expect(() =>
      sovereignIssuanceFlowsByCountry({
        atParIssues: [{ countryId: "US", face: -1 }],
        placements: [],
      })
    ).toThrow("Invalid");
    expect(() =>
      sovereignIssuanceFlowsByCountry({
        atParIssues: [],
        placements: [{ countryId: "US", face: 10_000, cashPaid: Number.NaN }],
      })
    ).toThrow("Invalid");
    expect(() =>
      sovereignIssuanceFlowsByCountry({
        atParIssues: [{ countryId: "JP", face: Number.MAX_SAFE_INTEGER }],
        placements: [{ countryId: "JP", face: 1, cashPaid: 1 }],
      })
    ).toThrow("safe units");
  });
});
