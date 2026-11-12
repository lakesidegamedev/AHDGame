import { describe, expect, it, vi } from "vitest";
import { orgRegLedgerCollection } from "./orgRegLedger";
import type { CollectionSource } from "./source";

describe("orgRegLedger repository", () => {
  it("opens orgRegLedger on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = orgRegLedgerCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("orgRegLedger");
    expect(handle).toEqual({ name: "orgRegLedger" });
  });
});
