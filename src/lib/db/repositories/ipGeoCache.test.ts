import { describe, expect, it, vi } from "vitest";
import { ipGeoCacheCollection } from "./ipGeoCache";
import type { CollectionSource } from "./source";

describe("ipGeoCache repository", () => {
  it("opens ipGeoCache on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = ipGeoCacheCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("ipGeoCache");
    expect(handle).toEqual({ name: "ipGeoCache" });
  });
});
