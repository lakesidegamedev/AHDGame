import { describe, expect, it, vi } from "vitest";
import { commodityFlowsCollection } from "./commodityFlows";
import type { CollectionSource } from "./source";

describe("commodityFlows repository", () => {
  it("opens commodityFlows on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = commodityFlowsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("commodityFlows");
    expect(handle).toEqual({ name: "commodityFlows" });
  });
});
