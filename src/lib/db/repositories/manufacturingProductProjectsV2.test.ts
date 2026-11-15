import { describe, expect, it, vi } from "vitest";
import { manufacturingProductProjectsV2Collection } from "./manufacturingProductProjectsV2";
import type { CollectionSource } from "./source";

describe("manufacturingProductProjectsV2 repository", () => {
  it("opens manufacturingProductProjectsV2 on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = manufacturingProductProjectsV2Collection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("manufacturingProductProjectsV2");
    expect(handle).toEqual({ name: "manufacturingProductProjectsV2" });
  });
});
