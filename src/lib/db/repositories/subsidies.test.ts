import { describe, expect, it, vi } from "vitest";
import { subsidiesCollection } from "./subsidies";
import type { CollectionSource } from "./source";

describe("subsidies repository", () => {
  it("opens subsidies on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = subsidiesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("subsidies");
    expect(handle).toEqual({ name: "subsidies" });
  });
});
