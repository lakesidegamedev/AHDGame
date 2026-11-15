import { describe, expect, it, vi } from "vitest";
import { bg1991ConstitutionalInitiativesCollection } from "./bg1991ConstitutionalInitiatives";
import type { CollectionSource } from "./source";

describe("bg1991ConstitutionalInitiatives repository", () => {
  it("opens bg1991ConstitutionalInitiatives on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bg1991ConstitutionalInitiativesCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bg1991ConstitutionalInitiatives");
    expect(handle).toEqual({ name: "bg1991ConstitutionalInitiatives" });
  });
});
