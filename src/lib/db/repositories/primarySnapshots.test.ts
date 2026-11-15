import { describe, expect, it, vi } from "vitest";
import { primarySnapshotsCollection } from "./primarySnapshots";
import type { CollectionSource } from "./source";

describe("primarySnapshots repository", () => {
  it("opens primarySnapshots on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = primarySnapshotsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("primarySnapshots");
    expect(handle).toEqual({ name: "primarySnapshots" });
  });
});
