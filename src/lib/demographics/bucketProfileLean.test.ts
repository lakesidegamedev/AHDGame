import { describe, expect, it } from "vitest";
import { getCountryLayer1Model } from "@/lib/seeds/international";
import { eraForPreset } from "@/lib/seeds/presetSelector";
import { bucketProfileLean, getBucketProfileForRegion } from "./bucketProfile";

describe("bucketProfileLean", () => {
  it("weights buckets by share times turnout", () => {
    const out = bucketProfileLean([
      {
        dim: "age",
        dimLabel: "Age",
        buckets: [
          { id: "age:a", label: "A", sharePct: 60, economicLean: -2, socialLean: 1, turnout: 50 },
          { id: "age:b", label: "B", sharePct: 40, economicLean: 2, socialLean: -1, turnout: 75 },
        ],
      },
    ]);
    const w = 60 * 50 + 40 * 75;
    expect(out.economicLean).toBeCloseTo((60 * 50 * -2 + 40 * 75 * 2) / w, 10);
    expect(out.socialLean).toBeCloseTo((60 * 50 * 1 + 40 * 75 * -1) / w, 10);
  });

  it("returns zeros for an empty profile", () => {
    expect(bucketProfileLean([])).toEqual({ economicLean: 0, socialLean: 0 });
  });

  it.each(["US", "UK", "DE", "JP"])(
    "%s: a real region profile gives finite leans in range",
    (cc) => {
      const id =
        cc === "US"
          ? "CT"
          : Object.keys(getCountryLayer1Model(cc, eraForPreset("2019-default"))!.census)[0];
      const profile = getBucketProfileForRegion(cc, id, "2019-default");
      expect(profile, cc).not.toBeNull();
      const lean = bucketProfileLean(profile!);
      expect(Number.isFinite(lean.economicLean)).toBe(true);
      expect(Math.abs(lean.economicLean)).toBeLessThanOrEqual(5);
      expect(Math.abs(lean.socialLean)).toBeLessThanOrEqual(5);
      expect(bucketProfileLean(profile!)).toEqual(lean);
    }
  );
});
