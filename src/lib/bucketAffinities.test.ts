import { describe, expect, it } from "vitest";
import { DOMAIN_BUCKET_AFFINITIES } from "./bucketAffinities";
import { calculateShiftImpacts } from "./archetypeAffinities";

describe("bucket affinity tables", () => {
  it("are keyed only by dim:bucket with finite values", () => {
    for (const [country, domains] of Object.entries(DOMAIN_BUCKET_AFFINITIES)) {
      for (const [domain, affinities] of Object.entries(domains)) {
        for (const [key, value] of Object.entries(affinities)) {
          expect(key, `${country}.${domain}`).toMatch(/^[a-z_]+:[a-z0-9_]+$/);
          expect(Number.isFinite(value), `${country}.${domain}.${key}`).toBe(true);
        }
      }
    }
  });

  it("produce deterministic, bounded, bucket-keyed shift impacts for every country", () => {
    for (const country of Object.keys(DOMAIN_BUCKET_AFFINITIES)) {
      const first = calculateShiftImpacts("economic", 1, 5, country);
      const second = calculateShiftImpacts("economic", 1, 5, country);
      expect(first).toEqual(second);
      for (const [key, impact] of Object.entries(first)) {
        expect(key).toContain(":");
        expect(Number.isFinite(impact)).toBe(true);
        expect(Math.abs(impact)).toBeLessThanOrEqual(10);
      }
    }
  });
});
