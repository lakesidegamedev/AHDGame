import { describe, expect, it, vi } from "vitest";
import { russianAssemblyOfficeArchivesCollection } from "./russianAssemblyOfficeArchives";
import type { CollectionSource } from "./source";

describe("russianAssemblyOfficeArchives repository", () => {
  it("opens russianAssemblyOfficeArchives on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = russianAssemblyOfficeArchivesCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("russianAssemblyOfficeArchives");
    expect(handle).toEqual({ name: "russianAssemblyOfficeArchives" });
  });
});
