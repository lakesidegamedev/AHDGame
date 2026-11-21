import { describe, expect, it } from "vitest";
import {
  splitFundedInventory,
  transferProducerClaims,
  producerDebtAnchor,
  producerStockBookAnchor,
  hasProducerDistress,
} from "./fundedOwnership";
import { producerPayableId } from "@/lib/market/producerMarket/payablesRules";

const stock = {
  worldEpoch: "world",
  turn: 7,
  inputStock: [{ commodity: "fuel", units: 10, value: 91.3 }],
  outputStock: [{ commodity: "energy", units: 7, book: "country:CA", quoteUnitCost: 3 }],
};
const claim = {
  debtorAccountId: "old",
  creditorAccountId: "workers",
  producerId: "site",
  kind: "labour" as const,
  amount: 123.456,
  notShrinkingSince: 2,
};
const bills = {
  worldEpoch: "world",
  turn: 7,
  claims: [{ ...claim, id: producerPayableId(claim) }],
};

describe("funded ownership conservation", () => {
  it.each([0, 0.01, 0.25, 0.5, 0.99, 1])(
    "conserves stock, basis and invoices at fraction %s",
    (fraction) => {
      const original = structuredClone(stock);
      const split = splitFundedInventory(stock, fraction);
      expect(split.moved.inputStock[0].units + split.kept.inputStock[0].units).toBe(10);
      expect(split.moved.outputStock[0].units + split.kept.outputStock[0].units).toBe(7);
      expect(
        producerStockBookAnchor(split.moved) + producerStockBookAnchor(split.kept)
      ).toBeCloseTo(112.3, 10);
      expect(split.moved.outputStock[0].book).toBe("country:CA");
      expect(stock).toEqual(original);
      const transferred = transferProducerClaims({
        source: bills,
        destinationAccountId: "state",
        sites: new Map([["site", { producerId: "new-site", fraction }]]),
      });
      expect(
        producerDebtAnchor(transferred.kept) + producerDebtAnchor(transferred.moved)
      ).toBeCloseTo(123.456, 10);
      expect(
        transferred.moved.claims.every(
          (c) => c.id === producerPayableId(c) && c.creditorAccountId === "workers"
        )
      ).toBe(true);
    }
  );
  it("preserves a large paid basis without denomination conversion", () => {
    const big = { ...stock, inputStock: [{ commodity: "fuel", units: 1e12, value: 1e15 }] };
    const { moved, kept } = splitFundedInventory(big, 0.37);
    expect(moved.inputStock[0].value + kept.inputStock[0].value).toBe(1e15);
  });
  it("does not replay an already transferred invoice", () => {
    const first = transferProducerClaims({ source: bills, destinationAccountId: "state" });
    const retry = transferProducerClaims({
      source: first.kept,
      destination: first.moved,
      destinationAccountId: "state",
    });
    expect(retry.moved).toEqual(first.moved);
    expect(producerDebtAnchor(retry.moved)).toBe(123.456);
  });
  it("rejects mixed worlds and malformed quantities", () => {
    expect(() => splitFundedInventory(stock, -1)).toThrow();
    expect(() =>
      splitFundedInventory(
        { ...stock, inputStock: [{ commodity: "fuel", units: NaN, value: 1 }] },
        0.5
      )
    ).toThrow();
    expect(() =>
      transferProducerClaims({
        source: bills,
        destination: { ...bills, worldEpoch: "other" },
        destinationAccountId: "state",
      })
    ).toThrow();
  });
  it("combines live liabilities with an older successor snapshot without changing creditor totals", () => {
    const destination = { ...bills, turn: 3, claims: [] };
    const moved = transferProducerClaims({
      source: bills,
      destination,
      destinationAccountId: "state",
    });
    expect(moved.moved.turn).toBe(7);
    expect(producerDebtAnchor(moved.moved)).toBe(123.456);
  });
  it("starts distress only after persistent unpaid credit reaches its runway", () => {
    expect(hasProducerDistress(bills, 5, 4)).toBe(false);
    expect(hasProducerDistress(bills, 6, 4)).toBe(true);
    expect(hasProducerDistress({ ...bills, claims: [] }, 99, 4)).toBe(false);
  });
});
