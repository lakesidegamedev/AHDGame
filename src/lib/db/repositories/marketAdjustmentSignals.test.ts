import { describe, expect, it, vi } from "vitest";
import { marketAdjustmentSignalsCollection } from "./marketAdjustmentSignals";
import type { CollectionSource } from "./source";

describe("marketAdjustmentSignals repository", () => {
  it("opens marketAdjustmentSignals on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = marketAdjustmentSignalsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("marketAdjustmentSignals");
    expect(handle).toEqual({ name: "marketAdjustmentSignals" });
  });
});
