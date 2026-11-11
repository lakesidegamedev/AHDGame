import { describe, expect, it, vi } from "vitest";
import { locLedgerCollection } from "./locLedger";
import type { CollectionSource } from "./source";

describe("locLedger repository", () => {
  it("opens locLedger on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = locLedgerCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("locLedger");
    expect(handle).toEqual({ name: "locLedger" });
  });
});
