import { describe, expect, it } from "vitest";
import { OPERATING_SECTOR_TYPES } from "@/lib/constants/corporationsClient";
import { bucketKey, enumerateCandidateBuckets, laneIdentities } from "./marketBuckets";

describe("market buckets", () => {
  it("lists every sector type once", () => {
    const lanes = laneIdentities();
    expect(lanes.map((l) => l.lane)).toEqual([...OPERATING_SECTOR_TYPES]);
    expect(lanes.find((l) => l.lane === "manufacturing")).toMatchObject({
      sectorType: "manufacturing",
    });
  });

  it("crosses regions with lanes and skips blocked buckets", () => {
    const blocked = new Set([bucketKey("A", "technology")]);
    const out = enumerateCandidateBuckets(["A", "B"], blocked);
    expect(out).toHaveLength(2 * OPERATING_SECTOR_TYPES.length - 1);
    expect(out.some((b) => b.key === "A:technology")).toBe(false);
    expect(out.some((b) => b.key === "B:technology")).toBe(true);
  });

  it("keeps the bucket key format", () => {
    expect(bucketKey("S", "manufacturing")).toBe("S:manufacturing");
    expect(bucketKey("S", "media")).toBe("S:media");
  });
});
