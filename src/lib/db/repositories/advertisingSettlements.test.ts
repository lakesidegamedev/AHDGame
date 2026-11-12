import { describe, expect, it, vi } from "vitest";
import { advertisingSettlementsCollection } from "./advertisingSettlements";
import type { CollectionSource } from "./source";

describe("advertisingSettlements repository", () => {
  it("opens advertisingSettlements on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = advertisingSettlementsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("advertisingSettlements");
    expect(handle).toEqual({ name: "advertisingSettlements" });
  });
});
