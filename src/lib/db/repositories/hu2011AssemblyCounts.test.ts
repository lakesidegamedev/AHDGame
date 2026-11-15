import { describe, expect, it, vi } from "vitest";
import { hu2011AssemblyCountsCollection } from "./hu2011AssemblyCounts";
import type { CollectionSource } from "./source";

describe("hu2011AssemblyCounts repository", () => {
  it("opens hu2011AssemblyCounts on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = hu2011AssemblyCountsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("hu2011AssemblyCounts");
    expect(handle).toEqual({ name: "hu2011AssemblyCounts" });
  });
});
