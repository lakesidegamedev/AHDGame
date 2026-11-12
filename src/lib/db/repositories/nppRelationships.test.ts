import { describe, expect, it, vi } from "vitest";
import { nppRelationshipsCollection } from "./nppRelationships";
import type { CollectionSource } from "./source";

describe("nppRelationships repository", () => {
  it("opens nppRelationships on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = nppRelationshipsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("nppRelationships");
    expect(handle).toEqual({ name: "nppRelationships" });
  });
});
