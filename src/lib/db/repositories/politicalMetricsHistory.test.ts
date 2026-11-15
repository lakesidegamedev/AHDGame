import { describe, expect, it, vi } from "vitest";
import { politicalMetricsHistoryCollection } from "./politicalMetricsHistory";
import type { CollectionSource } from "./source";

describe("politicalMetricsHistory repository", () => {
  it("opens politicalMetricsHistory on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = politicalMetricsHistoryCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("politicalMetricsHistory");
    expect(handle).toEqual({ name: "politicalMetricsHistory" });
  });
});
