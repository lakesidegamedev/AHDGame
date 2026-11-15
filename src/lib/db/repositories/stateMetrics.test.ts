import { describe, expect, it, vi } from "vitest";
import { stateMetricsCollection } from "./stateMetrics";
import type { CollectionSource } from "./source";

describe("stateMetrics repository", () => {
  it("opens stateMetrics on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = stateMetricsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("stateMetrics");
    expect(handle).toEqual({ name: "stateMetrics" });
  });
});
