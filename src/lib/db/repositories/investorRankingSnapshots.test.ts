import { describe, expect, it, vi } from "vitest";
import { investorRankingSnapshotsCollection } from "./investorRankingSnapshots";
import type { CollectionSource } from "./source";

describe("investorRankingSnapshots repository", () => {
  it("opens investorRankingSnapshots on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = investorRankingSnapshotsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("investorRankingSnapshots");
    expect(handle).toEqual({ name: "investorRankingSnapshots" });
  });
});
