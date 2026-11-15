import { describe, expect, it, vi } from "vitest";
import { equityLiquidityFacilitySnapshotsCollection } from "./equityLiquidityFacilitySnapshots";
import type { CollectionSource } from "./source";

describe("equityLiquidityFacilitySnapshots repository", () => {
  it("opens equityLiquidityFacilitySnapshots on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = equityLiquidityFacilitySnapshotsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("equityLiquidityFacilitySnapshots");
    expect(handle).toEqual({ name: "equityLiquidityFacilitySnapshots" });
  });
});
