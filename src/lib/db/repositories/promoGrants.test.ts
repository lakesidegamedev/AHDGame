import { describe, expect, it, vi } from "vitest";
import { promoGrantsCollection } from "./promoGrants";
import type { CollectionSource } from "./source";

describe("promoGrants repository", () => {
  it("opens promoGrants on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = promoGrantsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("promoGrants");
    expect(handle).toEqual({ name: "promoGrants" });
  });
});
