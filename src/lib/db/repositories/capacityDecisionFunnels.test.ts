import { describe, expect, it, vi } from "vitest";
import { capacityDecisionFunnelsCollection } from "./capacityDecisionFunnels";
import type { CollectionSource } from "./source";

describe("capacityDecisionFunnels repository", () => {
  it("opens capacityDecisionFunnels on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = capacityDecisionFunnelsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("capacityDecisionFunnels");
    expect(handle).toEqual({ name: "capacityDecisionFunnels" });
  });
});
