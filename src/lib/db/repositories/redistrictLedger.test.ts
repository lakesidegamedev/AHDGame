import { describe, expect, it, vi } from "vitest";
import { redistrictLedgerCollection } from "./redistrictLedger";
import type { CollectionSource } from "./source";

describe("redistrictLedger repository", () => {
  it("opens redistrictLedger on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = redistrictLedgerCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("redistrictLedger");
    expect(handle).toEqual({ name: "redistrictLedger" });
  });
});
