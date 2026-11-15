import { describe, expect, it, vi } from "vitest";
import { offTypeHandoversCollection } from "./offTypeHandovers";
import type { CollectionSource } from "./source";

describe("offTypeHandovers repository", () => {
  it("opens offTypeHandovers on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = offTypeHandoversCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("offTypeHandovers");
    expect(handle).toEqual({ name: "offTypeHandovers" });
  });
});
