import { describe, expect, it, vi } from "vitest";
import { nationalizationLedgerCollection } from "./nationalizationLedger";
import type { CollectionSource } from "./source";

describe("nationalizationLedger repository", () => {
  it("opens nationalizationLedger on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = nationalizationLedgerCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("nationalizationLedger");
    expect(handle).toEqual({ name: "nationalizationLedger" });
  });
});
