import { describe, expect, it } from "vitest";
import { getBucketProfileForRegion } from "../bucketProfile";
import { withLegislativePriorities } from "./profile";

describe("regional legislative priority presentation", () => {
  it.each([
    ["US", "TX"],
    ["UK", "SCO"],
    ["JP", "KAN"],
  ])("%s: enriches profiles without changing electorate inputs", (country, region) => {
    const original = getBucketProfileForRegion(country, region, "1953-default")!;
    const snapshot = structuredClone(original);
    const enriched = withLegislativePriorities(original, country, region)!;
    expect(original).toEqual(snapshot);
    expect(
      enriched.map((section) => ({
        ...section,
        buckets: section.buckets.map(({ legislativePriorities: _priorities, ...bucket }) => bucket),
      }))
    ).toEqual(original);
    for (const section of enriched) {
      for (const bucket of section.buckets) {
        if (section.dim === "urbanization") {
          expect(bucket.legislativePriorities).toBeNull();
        } else {
          expect(bucket.legislativePriorities?.primary.lawName).toBeTruthy();
          expect(bucket.legislativePriorities?.secondary).toHaveLength(3);
        }
      }
    }
    expect(
      original.flatMap((s) => s.buckets).every((b) => b.legislativePriorities === undefined)
    ).toBe(true);
  });

  it("preserves absent electorate data", () => {
    expect(withLegislativePriorities(null, "US", "CA")).toBeNull();
  });
});
