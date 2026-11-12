import { describe, expect, it, vi } from "vitest";
import { politicalMetricsRegionHistoryCollection } from "./politicalMetricsRegionHistory";
import type { CollectionSource } from "./source";

describe("politicalMetricsRegionHistory repository", () => {
  it("opens politicalMetricsRegionHistory on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = politicalMetricsRegionHistoryCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("politicalMetricsRegionHistory");
    expect(handle).toEqual({ name: "politicalMetricsRegionHistory" });
  });
});
