import { describe, expect, it, vi } from "vitest";
import { coalitionsCollection } from "./coalitions";
import type { CollectionSource } from "./source";

describe("coalitions repository", () => {
  it("opens coalitions on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = coalitionsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("coalitions");
    expect(handle).toEqual({ name: "coalitions" });
  });
});
