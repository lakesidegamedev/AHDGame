import { describe, expect, it, vi } from "vitest";
import { demographicFlowReceiptsCollection } from "./demographicFlowReceipts";
import type { CollectionSource } from "./source";

describe("demographicFlowReceipts repository", () => {
  it("opens demographicFlowReceipts on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = demographicFlowReceiptsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("demographicFlowReceipts");
    expect(handle).toEqual({ name: "demographicFlowReceipts" });
  });
});
