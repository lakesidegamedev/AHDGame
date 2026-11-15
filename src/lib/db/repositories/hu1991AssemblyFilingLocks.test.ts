import { describe, expect, it, vi } from "vitest";
import { hu1991AssemblyFilingLocksCollection } from "./hu1991AssemblyFilingLocks";
import type { CollectionSource } from "./source";

describe("hu1991AssemblyFilingLocks repository", () => {
  it("opens hu1991AssemblyFilingLocks on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = hu1991AssemblyFilingLocksCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("hu1991AssemblyFilingLocks");
    expect(handle).toEqual({ name: "hu1991AssemblyFilingLocks" });
  });
});
