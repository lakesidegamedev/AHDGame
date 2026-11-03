import { describe, expect, it } from "vitest";
import { eligibleRegionalDimensions, retainRegionalRepresentation } from "./regionalCoverage";
import { deriveGranularElectorateUnits, clearGranularElectorateCache } from "../granularElectorate";
import { getBucketProfileForRegion } from "../bucketProfile";
import { getCountrySubstrateForYear } from "@/lib/seeds/eraSubstrateForYear";
import { getCountryLayer1Model } from "@/lib/seeds/international";
import type { EraId } from "@/lib/seeds/presetSelector";

describe("UK/JP eligible electorate representation", () => {
  it.each(["UK", "JP"])("%s: retains every eligible marginal in every region in 2000", (cc) => {
    for (const region of Object.keys(getCountryLayer1Model(cc, "1999")!.census)) {
      const substrate = getCountrySubstrateForYear(cc, region, 2000)!;
      const profile = getBucketProfileForRegion(cc, region, "1999-default", null, {
        year: 2000,
        startingYear: 1999,
      })!;
      for (const section of profile) {
        const original = substrate.marginals[section.dim];
        const eligible = Object.entries(original).filter(
          ([bucket, pct]) =>
            pct > 0 &&
            !(
              cc === "JP" &&
              section.dim === "ethnicity" &&
              substrate.turnoutRates.ethnicity[bucket] === 0
            )
        );
        const total = eligible.reduce((n, [, pct]) => n + pct, 0);
        expect(section.buckets.map((b) => b.id).sort()).toEqual(
          eligible.map(([key]) => `${section.dim}:${key}`).sort()
        );
        for (const [key, pct] of eligible)
          expect(
            section.buckets.find((b) => b.id === `${section.dim}:${key}`)!.sharePct
          ).toBeCloseTo((pct * 100) / total, 6);
      }
    }
  });

  it.each(["1953", "1979", "1991", "1999", "2007", "2019", "2023", "2027"] as EraId[])(
    "%s: keeps finite positive coalesced units and scopes coverage to the calibrated era",
    (era) => {
      clearGranularElectorateCache();
      for (const cc of ["UK", "JP"])
        for (const region of Object.keys(getCountryLayer1Model(cc, era)!.census)) {
          const units = deriveGranularElectorateUnits(cc, region, `${era}-default`, null)!.units;
          // Current fixtures peak at 211 units after retaining minority cells.
          expect(units.length).toBeLessThanOrEqual(256);
          expect(units.reduce((s, u) => s + u.share, 0)).toBeCloseTo(1, 10);
          for (const u of units) {
            expect(u.share).toBeGreaterThan(0);
            expect(
              [u.economicLean, u.socialLean, u.turnout, ...Object.values(u.bucketWeights)].every(
                Number.isFinite
              )
            ).toBe(true);
            if (cc === "JP" && era === "1999")
              expect(
                Object.keys(u.bucketWeights).filter((key) => key.startsWith("ethnicity:"))
              ).toEqual(["ethnicity:japanese"]);
          }
        }
    }
  );

  it("does not change other countries or periods", () => {
    for (const cc of ["UK", "JP"]) {
      for (const year of [1953, 1979, 1991, 1998, 2007, 2019, 2027])
        expect(retainRegionalRepresentation(cc, year)).toBe(false);
      for (const year of [1999, 2000, 2006])
        expect(retainRegionalRepresentation(cc, year)).toBe(true);
    }
    expect(retainRegionalRepresentation("US", 2000)).toBe(false);
  });

  it("does not mutate inputs or turn turnout campaigns into nationality eligibility", () => {
    const dims = [
      {
        name: "ethnicity",
        marginals: { japanese: 98, korean: 2 },
        turnoutRates: { japanese: 55, korean: 60 },
      },
    ];
    const snapshot = structuredClone(dims);
    expect(
      eligibleRegionalDimensions("JP", dims, { japanese: 55, korean: 0 })[0].marginals
    ).toEqual({ japanese: 100 });
    expect(dims).toEqual(snapshot);
    expect(eligibleRegionalDimensions("UK", dims, { japanese: 55, korean: 0 })).toBe(dims);
  });
});
