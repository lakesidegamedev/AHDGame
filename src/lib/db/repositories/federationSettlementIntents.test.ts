import { describe, expect, it, vi } from "vitest";
import { federationSettlementIntentsCollection } from "./federationSettlementIntents";
import type { CollectionSource } from "./source";

describe("federationSettlementIntents repository", () => {
  it("opens federationSettlementIntents on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = federationSettlementIntentsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("federationSettlementIntents");
    expect(handle).toEqual({ name: "federationSettlementIntents" });
  });
});
