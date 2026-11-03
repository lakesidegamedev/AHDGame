import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { loadReceiptLanePrices } from "./receiptLanePrices";

function fakeDb(doc: unknown) {
  const findOne = vi.fn(async () => doc);
  return { db: { collection: () => ({ findOne }) } as unknown as Db, findOne };
}

describe("loadReceiptLanePrices", () => {
  it("reads the outcome by the turn engine's id for the receipt's turn", async () => {
    const { db, findOne } = fakeDb({ laneClearingPrices: { "energy|world": 10 } });
    const out = await loadReceiptLanePrices(db, {
      worldEpochId: "epoch-1",
      receiptTurn: 9,
      currentTurn: 10,
    });
    expect(findOne).toHaveBeenCalledWith(
      { _id: "epoch-1:9" },
      { projection: { laneClearingPrices: 1 } }
    );
    expect(out).toEqual({ laneClearingPrices: { "energy|world": 10 } });
  });

  it("reads nothing without an epoch, a receipt, or a fresh receipt", async () => {
    for (const args of [
      { worldEpochId: undefined, receiptTurn: 9, currentTurn: 10 },
      { worldEpochId: "e", receiptTurn: undefined, currentTurn: 10 },
      { worldEpochId: "e", receiptTurn: 5, currentTurn: 10 },
    ]) {
      const { db, findOne } = fakeDb({ laneClearingPrices: {} });
      expect(await loadReceiptLanePrices(db, args)).toEqual({});
      expect(findOne).not.toHaveBeenCalled();
    }
  });

  it("returns nothing when the outcome has no lane prices", async () => {
    const { db } = fakeDb({ _id: "epoch-1" });
    expect(
      await loadReceiptLanePrices(db, { worldEpochId: "epoch-1", receiptTurn: 9, currentTurn: 9 })
    ).toEqual({});
  });
});
