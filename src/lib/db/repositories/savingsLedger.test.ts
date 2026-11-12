import { describe, expect, it, vi } from "vitest";
import { savingsLedgerCollection } from "./savingsLedger";
import type { CollectionSource } from "./source";

describe("savingsLedger repository", () => {
  it("opens savingsLedger on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = savingsLedgerCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("savingsLedger");
    expect(handle).toEqual({ name: "savingsLedger" });
  });
});
