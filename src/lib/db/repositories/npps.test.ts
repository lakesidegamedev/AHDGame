import { describe, expect, it, vi } from "vitest";
import { nppsCollection } from "./npps";
import type { CollectionSource } from "./source";

describe("npps repository", () => {
  it("opens npps on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = nppsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("npps");
    expect(handle).toEqual({ name: "npps" });
  });
});
