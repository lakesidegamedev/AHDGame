import { describe, expect, it, vi } from "vitest";
import { governmentTendersCollection } from "./governmentTenders";
import type { CollectionSource } from "./source";

describe("governmentTenders repository", () => {
  it("opens governmentTenders on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = governmentTendersCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("governmentTenders");
    expect(handle).toEqual({ name: "governmentTenders" });
  });
});
