import { describe, expect, it, vi } from "vitest";
import { ledgerEntriesCollection } from "./ledgerEntries";
import type { CollectionSource } from "./source";

describe("ledgerEntries repository", () => {
  it("opens ledgerEntries on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = ledgerEntriesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("ledgerEntries");
    expect(handle).toEqual({ name: "ledgerEntries" });
  });
});
