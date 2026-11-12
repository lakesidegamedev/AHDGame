import { describe, expect, it, vi } from "vitest";
import { bankMoneyMovesCollection } from "./bankMoneyMoves";
import type { CollectionSource } from "./source";

describe("bankMoneyMoves repository", () => {
  it("opens bankMoneyMoves on the source it is given", () => {
    const collection = vi.fn((name: string) => ({ name }));
    const handle = bankMoneyMovesCollection({ collection } as unknown as CollectionSource);
    expect(collection).toHaveBeenCalledExactlyOnceWith("bankMoneyMoves");
    expect(handle).toEqual({ name: "bankMoneyMoves" });
  });
});
