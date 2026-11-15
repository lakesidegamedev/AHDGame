import { describe, expect, it, vi } from "vitest";
import { hu2011AssemblyOfficeArchivesCollection } from "./hu2011AssemblyOfficeArchives";
import type { CollectionSource } from "./source";

describe("hu2011AssemblyOfficeArchives repository", () => {
  it("opens hu2011AssemblyOfficeArchives on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = hu2011AssemblyOfficeArchivesCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("hu2011AssemblyOfficeArchives");
    expect(handle).toEqual({ name: "hu2011AssemblyOfficeArchives" });
  });
});
