import { describe, expect, it, vi } from "vitest";
import { macroMetricsCollection } from "./macroMetrics";
import type { CollectionSource } from "./source";

describe("macroMetrics repository", () => {
  it("opens macroMetrics on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = macroMetricsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("macroMetrics");
    expect(handle).toEqual({ name: "macroMetrics" });
  });
});
