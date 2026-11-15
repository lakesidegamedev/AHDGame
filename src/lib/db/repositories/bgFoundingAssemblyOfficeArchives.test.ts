import { describe, expect, it, vi } from "vitest";
import { bgFoundingAssemblyOfficeArchivesCollection } from "./bgFoundingAssemblyOfficeArchives";
import type { CollectionSource } from "./source";

describe("bgFoundingAssemblyOfficeArchives repository", () => {
  it("opens bgFoundingAssemblyOfficeArchives on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bgFoundingAssemblyOfficeArchivesCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bgFoundingAssemblyOfficeArchives");
    expect(handle).toEqual({ name: "bgFoundingAssemblyOfficeArchives" });
  });
});
