import { describe, expect, it, vi } from "vitest";
import { legislationTypesCollection } from "./legislationTypes";
import type { CollectionSource } from "./source";

describe("legislationTypes repository", () => {
  it("opens legislationTypes on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = legislationTypesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("legislationTypes");
    expect(handle).toEqual({ name: "legislationTypes" });
  });
});
