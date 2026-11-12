import { describe, expect, it, vi } from "vitest";
import { hu1991AssemblyCountsCollection } from "./hu1991AssemblyCounts";
import type { CollectionSource } from "./source";

describe("hu1991AssemblyCounts repository", () => {
  it("opens hu1991AssemblyCounts on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = hu1991AssemblyCountsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("hu1991AssemblyCounts");
    expect(handle).toEqual({ name: "hu1991AssemblyCounts" });
  });
});
