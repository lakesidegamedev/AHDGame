import { describe, expect, it, vi } from "vitest";
import { pensionSchemesCollection } from "./pensionSchemes";
import type { CollectionSource } from "./source";

describe("pensionSchemes repository", () => {
  it("opens pensionSchemes on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = pensionSchemesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("pensionSchemes");
    expect(handle).toEqual({ name: "pensionSchemes" });
  });
});
