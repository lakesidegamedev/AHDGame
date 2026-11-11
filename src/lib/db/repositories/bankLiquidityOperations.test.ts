import { describe, expect, it, vi } from "vitest";
import { bankLiquidityOperationsCollection } from "./bankLiquidityOperations";
import type { CollectionSource } from "./source";

describe("bankLiquidityOperations repository", () => {
  it("opens bankLiquidityOperations on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bankLiquidityOperationsCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bankLiquidityOperations");
    expect(handle).toEqual({ name: "bankLiquidityOperations" });
  });
});
