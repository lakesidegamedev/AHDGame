import { describe, expect, it, vi } from "vitest";
import { governorExecutiveOrdersCollection } from "./governorExecutiveOrders";
import type { CollectionSource } from "./source";

describe("governorExecutiveOrders repository", () => {
  it("opens governorExecutiveOrders on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = governorExecutiveOrdersCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("governorExecutiveOrders");
    expect(handle).toEqual({ name: "governorExecutiveOrders" });
  });
});
