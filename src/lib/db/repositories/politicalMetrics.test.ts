import { describe, expect, it, vi } from "vitest";
import { politicalMetricsCollection } from "./politicalMetrics";
import type { CollectionSource } from "./source";

describe("politicalMetrics repository", () => {
  it("opens politicalMetrics on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = politicalMetricsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("politicalMetrics");
    expect(handle).toEqual({ name: "politicalMetrics" });
  });
});
