import { describe, expect, it, vi } from "vitest";
import { stateBillsCollection } from "./stateBills";
import type { CollectionSource } from "./source";

describe("stateBills repository", () => {
  it("opens stateBills on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = stateBillsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("stateBills");
    expect(handle).toEqual({ name: "stateBills" });
  });
});
