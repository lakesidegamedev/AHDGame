import { describe, expect, it, vi } from "vitest";
import { altClustersCollection } from "./altClusters";
import type { CollectionSource } from "./source";

describe("altClusters repository", () => {
  it("opens altClusters on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = altClustersCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("altClusters");
    expect(handle).toEqual({ name: "altClusters" });
  });
});
