import { describe, expect, it } from "vitest";
import { OPERATING_SECTOR_TYPES } from "@/lib/constants/corporationsClient";
import { bucketKey, enumerateCandidateBuckets, laneIdentities } from "./marketBuckets";

describe("market buckets", () => {
  it("lists every lane once with its stored identity", () => {
    const lanes = laneIdentities();
    expect(lanes.map((l) => l.lane)).toEqual([...OPERATING_SECTOR_TYPES]);
    const vehicles = lanes.find((l) => l.lane === "manufacturing_vehicles");
    expect(vehicles).toMatchObject({ sectorType: "manufacturing", industryModel: "vehicles" });
  });

  it("crosses regions with lanes and skips blocked buckets", () => {
    const blocked = new Set([bucketKey("A", "technology")]);
    const out = enumerateCandidateBuckets(["A", "B"], blocked);
    expect(out).toHaveLength(2 * OPERATING_SECTOR_TYPES.length - 1);
    expect(out.some((b) => b.key === "A:technology")).toBe(false);
    expect(out.some((b) => b.key === "B:technology")).toBe(true);
  });

  it("keeps the bucket key format", () => {
    expect(bucketKey("S", "manufacturing", "vehicles")).toBe("S:manufacturing:vehicles");
    expect(bucketKey("S", "media", null, "entertainment")).toBe("S:media:generic:entertainment");
  });
});
