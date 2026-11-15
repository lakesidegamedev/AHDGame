import { describe, expect, it, vi } from "vitest";
import { currencyOrdersCollection } from "./currencyOrders";
import type { CollectionSource } from "./source";

describe("currencyOrders repository", () => {
  it("opens currencyOrders on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = currencyOrdersCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("currencyOrders");
    expect(handle).toEqual({ name: "currencyOrders" });
  });
});
