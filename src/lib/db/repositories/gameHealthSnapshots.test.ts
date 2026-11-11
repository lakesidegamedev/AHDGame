import { describe, expect, it, vi } from "vitest";
import { gameHealthSnapshotsCollection } from "./gameHealthSnapshots";
import type { CollectionSource } from "./source";

describe("gameHealthSnapshots repository", () => {
  it("opens gameHealthSnapshots on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = gameHealthSnapshotsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("gameHealthSnapshots");
    expect(handle).toEqual({ name: "gameHealthSnapshots" });
  });
});
