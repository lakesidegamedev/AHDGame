import { describe, expect, it, vi } from "vitest";
import { bankTreasuryTradesCollection } from "./bankTreasuryTrades";
import type { CollectionSource } from "./source";

describe("bankTreasuryTrades repository", () => {
  it("opens bankTreasuryTrades on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bankTreasuryTradesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bankTreasuryTrades");
    expect(handle).toEqual({ name: "bankTreasuryTrades" });
  });
});
