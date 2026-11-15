import { describe, expect, it, vi } from "vitest";
import { commoditySourcingFlowsCollection } from "./commoditySourcingFlows";
import type { CollectionSource } from "./source";

describe("commoditySourcingFlows repository", () => {
  it("opens commoditySourcingFlows on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = commoditySourcingFlowsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("commoditySourcingFlows");
    expect(handle).toEqual({ name: "commoditySourcingFlows" });
  });
});
