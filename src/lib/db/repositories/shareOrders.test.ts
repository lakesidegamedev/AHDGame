import { describe, expect, it, vi } from "vitest";
import { shareOrdersCollection } from "./shareOrders";
import type { CollectionSource } from "./source";

describe("shareOrders repository", () => {
  it("opens shareOrders on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = shareOrdersCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("shareOrders");
    expect(handle).toEqual({ name: "shareOrders" });
  });
});
