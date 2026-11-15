import { describe, expect, it, vi } from "vitest";
import { productVenturesCollection } from "./productVentures";
import type { CollectionSource } from "./source";

describe("productVentures repository", () => {
  it("opens productVentures on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = productVenturesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("productVentures");
    expect(handle).toEqual({ name: "productVentures" });
  });
});
