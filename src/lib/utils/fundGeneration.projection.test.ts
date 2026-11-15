import { describe, it, expect } from "vitest";
import {
  projectCharacterGeneration,
  projectNppGeneration,
  getTotalFundGeneration,
  calculateNppFundGeneration,
  calculateFullFundDistribution,
} from "./fundGeneration";

describe("projectCharacterGeneration", () => {
  it.each(["SCO", "WAL", "IE"])(
    "keeps %s profile income and turn projections usable after conversion",
    (countryId) => {
      for (const preset of [
        "1953-default",
        "1979-default",
        "1991-default",
        "1999-default",
        "2007-default",
        "2019-default",
        "2023-default",
        "2027-default",
      ]) {
        const distribution = calculateFullFundDistribution(
          500_000,
          3,
          null,
          5,
          10,
          15_000,
          countryId,
          40,
          preset
        );
        const projected = projectCharacterGeneration({
          population: 500_000,
          donorBaseLevel: 3,
          currentOffice: null,
          stateGdpMillions: 15_000,
          countryId,
          politicalInfluence: 40,
          preset,
        });
        expect(Number.isFinite(distribution.totalGeneration)).toBe(true);
        // Distribution rounds each income leg; the turn projection rounds the sum.
        expect(Math.abs(projected - distribution.totalGeneration)).toBeLessThanOrEqual(1);
        expect(
          distribution.characterReceives +
            distribution.stateTaxAmount +
            distribution.nationalTaxAmount
        ).toBe(distribution.totalGeneration);
      }
    }
  );
  it("equals getTotalFundGeneration with the full 6-arg signature", () => {
    const office = null;
    const expected = getTotalFundGeneration(39_000_000, 3, office, 2_800_000, "US", 40);
    const actual = projectCharacterGeneration({
      population: 39_000_000,
      donorBaseLevel: 3,
      currentOffice: office,
      stateGdpMillions: 2_800_000,
      countryId: "US",
      politicalInfluence: 40,
    });
    expect(actual).toBe(expected);
  });

  it("defaults countryId to US and influence to 0 when omitted", () => {
    const expected = getTotalFundGeneration(5_000_000, 0, null, undefined, "US", 0);
    const actual = projectCharacterGeneration({
      population: 5_000_000,
      donorBaseLevel: 0,
      currentOffice: null,
    });
    expect(actual).toBe(expected);
  });

  it("passes stateGdpMillions through unchanged — missing GDP (undefined) yields the country-average scalar (1.0), not the 0.9 floor", () => {
    const withUndefined = projectCharacterGeneration({
      population: 100_000,
      donorBaseLevel: 0,
      currentOffice: null,
      stateGdpMillions: undefined,
      countryId: "US",
    });
    // undefined GDP → scalar 1.0 → small-tier base $5,000 unscaled
    expect(withUndefined).toBe(5_000);
    // whereas an explicit gdp of 0 would clamp to the 0.9 floor → $4,500
    const withZero = projectCharacterGeneration({
      population: 100_000,
      donorBaseLevel: 0,
      currentOffice: null,
      stateGdpMillions: 0,
      countryId: "US",
    });
    expect(withZero).toBe(4_500);
  });
});

describe("projectNppGeneration", () => {
  it("equals calculateNppFundGeneration when the NPP economy is enabled (no FX, no office)", () => {
    const expected = calculateNppFundGeneration(39_000_000, 2, 500_000);
    const actual = projectNppGeneration({
      population: 39_000_000,
      donorBaseLevel: 2,
      currentFundsLocal: 500_000,
      nppEconomyEnabled: true,
    });
    expect(actual).toBe(expected);
  });

  it("returns 0 when the NPP economy is DISABLED — NPPs generate/are taxed nothing", () => {
    // processNppFundGeneration early-returns when nppEconomyEnabled is false, so
    // NPPs deposit $0. The projection MUST mirror that or display/GOTV revenue
    // counts phantom NPP income the treasury never receives.
    expect(
      projectNppGeneration({
        population: 39_000_000,
        donorBaseLevel: 2,
        currentFundsLocal: 500_000,
        nppEconomyEnabled: false,
      })
    ).toBe(0);
  });

  it("treats funds as local in every country — currency plays no factor", () => {
    // A non-US NPP with the same local funds yields the same gross; there is
    // no anchor conversion. (Funds are stored local; FX is irrelevant.)
    const expected = calculateNppFundGeneration(8_000_000, 1, 400_000);
    const actual = projectNppGeneration({
      population: 8_000_000,
      donorBaseLevel: 1,
      currentFundsLocal: 400_000,
      nppEconomyEnabled: true,
    });
    expect(actual).toBe(expected);
  });

  it("returns 0 gross for an NPP with no population", () => {
    expect(
      projectNppGeneration({
        population: 0,
        donorBaseLevel: 0,
        currentFundsLocal: 0,
        nppEconomyEnabled: true,
      })
    ).toBe(0);
  });
});
