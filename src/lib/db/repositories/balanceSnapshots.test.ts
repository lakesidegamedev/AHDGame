import { describe, expect, it, vi } from "vitest";
import { balanceSnapshotsCollection } from "./balanceSnapshots";
import type { CollectionSource } from "./source";

describe("balanceSnapshots repository", () => {
  it("opens balanceSnapshots on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = balanceSnapshotsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("balanceSnapshots");
    expect(handle).toEqual({ name: "balanceSnapshots" });
  });
});
