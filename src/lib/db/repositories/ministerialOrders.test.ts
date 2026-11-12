import { describe, expect, it, vi } from "vitest";
import { ministerialOrdersCollection } from "./ministerialOrders";
import type { CollectionSource } from "./source";

describe("ministerialOrders repository", () => {
  it("opens ministerialOrders on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = ministerialOrdersCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("ministerialOrders");
    expect(handle).toEqual({ name: "ministerialOrders" });
  });
});
