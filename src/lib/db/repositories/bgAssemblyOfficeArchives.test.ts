import { describe, expect, it, vi } from "vitest";
import { bgAssemblyOfficeArchivesCollection } from "./bgAssemblyOfficeArchives";
import type { CollectionSource } from "./source";

describe("bgAssemblyOfficeArchives repository", () => {
  it("opens bgAssemblyOfficeArchives on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bgAssemblyOfficeArchivesCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bgAssemblyOfficeArchives");
    expect(handle).toEqual({ name: "bgAssemblyOfficeArchives" });
  });
});
