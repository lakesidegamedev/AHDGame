import { describe, expect, it, vi } from "vitest";
import { balanceSnapshotCheckpointsCollection } from "./balanceSnapshotCheckpoints";
import type { CollectionSource } from "./source";

describe("balanceSnapshotCheckpoints repository", () => {
  it("opens balanceSnapshotCheckpoints on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = balanceSnapshotCheckpointsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("balanceSnapshotCheckpoints");
    expect(handle).toEqual({ name: "balanceSnapshotCheckpoints" });
  });
});
