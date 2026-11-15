import { describe, expect, it, vi } from "vitest";
import { stockExchangeSnapshotsCollection } from "./stockExchangeSnapshots";
import type { CollectionSource } from "./source";

describe("stockExchangeSnapshots repository", () => {
  it("opens stockExchangeSnapshots on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = stockExchangeSnapshotsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("stockExchangeSnapshots");
    expect(handle).toEqual({ name: "stockExchangeSnapshots" });
  });
});
