import { describe, expect, it, vi } from "vitest";
import { defenceProcurementAllocationsCollection } from "./defenceProcurementAllocations";
import type { CollectionSource } from "./source";

describe("defenceProcurementAllocations repository", () => {
  it("opens defenceProcurementAllocations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = defenceProcurementAllocationsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("defenceProcurementAllocations");
    expect(handle).toEqual({ name: "defenceProcurementAllocations" });
  });
});
