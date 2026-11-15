import { describe, expect, it, vi } from "vitest";
import { bgFoundingAssemblyFilingLocksCollection } from "./bgFoundingAssemblyFilingLocks";
import type { CollectionSource } from "./source";

describe("bgFoundingAssemblyFilingLocks repository", () => {
  it("opens bgFoundingAssemblyFilingLocks on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bgFoundingAssemblyFilingLocksCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bgFoundingAssemblyFilingLocks");
    expect(handle).toEqual({ name: "bgFoundingAssemblyFilingLocks" });
  });
});
