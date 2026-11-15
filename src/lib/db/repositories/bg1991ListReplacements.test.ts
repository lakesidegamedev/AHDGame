import { describe, expect, it, vi } from "vitest";
import { bg1991ListReplacementsCollection } from "./bg1991ListReplacements";
import type { CollectionSource } from "./source";

describe("bg1991ListReplacements repository", () => {
  it("opens bg1991ListReplacements on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bg1991ListReplacementsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bg1991ListReplacements");
    expect(handle).toEqual({ name: "bg1991ListReplacements" });
  });
});
