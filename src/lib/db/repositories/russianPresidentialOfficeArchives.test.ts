import { describe, expect, it, vi } from "vitest";
import { russianPresidentialOfficeArchivesCollection } from "./russianPresidentialOfficeArchives";
import type { CollectionSource } from "./source";

describe("russianPresidentialOfficeArchives repository", () => {
  it("opens russianPresidentialOfficeArchives on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = russianPresidentialOfficeArchivesCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("russianPresidentialOfficeArchives");
    expect(handle).toEqual({ name: "russianPresidentialOfficeArchives" });
  });
});
