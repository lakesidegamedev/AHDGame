import { describe, expect, it, vi } from "vitest";
import { wealthListSnapshotsCollection } from "./wealthListSnapshots";
import type { CollectionSource } from "./source";

describe("wealthListSnapshots repository", () => {
  it("opens wealthListSnapshots on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = wealthListSnapshotsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("wealthListSnapshots");
    expect(handle).toEqual({ name: "wealthListSnapshots" });
  });
});
