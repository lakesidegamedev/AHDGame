import { describe, expect, it, vi } from "vitest";
import { caucusesCollection } from "./caucuses";
import type { CollectionSource } from "./source";

describe("caucuses repository", () => {
  it("opens caucuses on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = caucusesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("caucuses");
    expect(handle).toEqual({ name: "caucuses" });
  });
});
