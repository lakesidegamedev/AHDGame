import { describe, expect, it, vi } from "vitest";
import { hu1991AssemblyOfficeArchivesCollection } from "./hu1991AssemblyOfficeArchives";
import type { CollectionSource } from "./source";

describe("hu1991AssemblyOfficeArchives repository", () => {
  it("opens hu1991AssemblyOfficeArchives on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = hu1991AssemblyOfficeArchivesCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("hu1991AssemblyOfficeArchives");
    expect(handle).toEqual({ name: "hu1991AssemblyOfficeArchives" });
  });
});
