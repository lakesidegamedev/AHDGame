import { describe, expect, it, vi } from "vitest";
import { fundFloatSettlementsCollection } from "./fundFloatSettlements";
import type { CollectionSource } from "./source";

describe("fundFloatSettlements repository", () => {
  it("opens fundFloatSettlements on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = fundFloatSettlementsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("fundFloatSettlements");
    expect(handle).toEqual({ name: "fundFloatSettlements" });
  });
});
