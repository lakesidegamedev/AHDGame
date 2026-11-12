import { describe, expect, it, vi } from "vitest";
import { macroMetricsHistoryCollection } from "./macroMetricsHistory";
import type { CollectionSource } from "./source";

describe("macroMetricsHistory repository", () => {
  it("opens macroMetricsHistory on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = macroMetricsHistoryCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("macroMetricsHistory");
    expect(handle).toEqual({ name: "macroMetricsHistory" });
  });
});
