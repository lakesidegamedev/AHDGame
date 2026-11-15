import { describe, expect, it, vi } from "vitest";
import { federationCustodyRecordsCollection } from "./federationCustodyRecords";
import type { CollectionSource } from "./source";

describe("federationCustodyRecords repository", () => {
  it("opens federationCustodyRecords on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = federationCustodyRecordsCollection({
      collection,
    } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("federationCustodyRecords");
    expect(handle).toEqual({ name: "federationCustodyRecords" });
  });
});
