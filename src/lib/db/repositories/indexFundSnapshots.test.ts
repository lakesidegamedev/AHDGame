import { describe, expect, it, vi } from "vitest";
import { indexFundSnapshotsCollection } from "./indexFundSnapshots";
import type { CollectionSource } from "./source";

describe("indexFundSnapshots repository", () => {
  it("opens indexFundSnapshots on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = indexFundSnapshotsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("indexFundSnapshots");
    expect(handle).toEqual({ name: "indexFundSnapshots" });
  });
});
