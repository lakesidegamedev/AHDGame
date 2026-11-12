import { describe, expect, it, vi } from "vitest";
import { bgFoundingAssemblyCountsCollection } from "./bgFoundingAssemblyCounts";
import type { CollectionSource } from "./source";

describe("bgFoundingAssemblyCounts repository", () => {
  it("opens bgFoundingAssemblyCounts on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bgFoundingAssemblyCountsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bgFoundingAssemblyCounts");
    expect(handle).toEqual({ name: "bgFoundingAssemblyCounts" });
  });
});
