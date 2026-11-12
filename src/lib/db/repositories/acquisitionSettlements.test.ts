import { describe, expect, it, vi } from "vitest";
import { acquisitionSettlementsCollection } from "./acquisitionSettlements";
import type { CollectionSource } from "./source";

describe("acquisitionSettlements repository", () => {
  it("opens acquisitionSettlements on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = acquisitionSettlementsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("acquisitionSettlements");
    expect(handle).toEqual({ name: "acquisitionSettlements" });
  });
});
