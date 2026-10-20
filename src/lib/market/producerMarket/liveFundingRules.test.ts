import { describe, expect, it } from "vitest";
import { legsNet } from "@/lib/banking/moneyMove";
import {
  closeTransferMoves,
  householdOpeningMoves,
  investmentFundingMoves,
  investmentReturnMoves,
  publicFundingMoves,
  publicReturnMoves,
  transitionSupportMoves,
} from "./liveFundingRules";

const wallet = { walletId: "pub-us", amountLocal: 50, currencyCode: "USD", localPerAnchor: 1 };

describe("live producer money flows", () => {
  it("keys every move by world, turn and party and skips zero amounts", () => {
    const moves = publicFundingMoves("w", 7, [
      { ...wallet, countryId: "us" },
      { ...wallet, countryId: "gb", amountLocal: 0 },
    ]);
    expect(moves.map((m) => m.key)).toEqual(["producer-public-funding:w:7:us"]);
    expect(moves[0].legs.map((l) => l.kind)).toEqual(["mint", "credit"]);
    expect(
      publicReturnMoves("w", 7, [{ ...wallet, countryId: "us" }])[0].legs.map((l) => l.kind)
    ).toEqual(["debit", "burn"]);
  });

  it("keys construction funding apart from public funding for the same country", () => {
    const funding = investmentFundingMoves("w", 7, [
      { ...wallet, walletId: "inv-us", countryId: "us" },
    ]);
    const back = investmentReturnMoves("w", 7, [
      { ...wallet, walletId: "inv-us", countryId: "us", amountLocal: 20 },
    ]);
    expect(funding.map((m) => m.key)).toEqual(["producer-investment-funding:w:7:us"]);
    expect(back.map((m) => m.key)).toEqual(["producer-investment-return:w:7:us"]);
    expect(funding[0].legs.map((l) => l.kind)).toEqual(["mint", "credit"]);
    expect(back[0].legs.map((l) => l.kind)).toEqual(["debit", "burn"]);
    expect(
      investmentFundingMoves("w", 7, [{ ...wallet, countryId: "us", amountLocal: 0 }])
    ).toEqual([]);
  });

  it("seeds households once per world and requires an approval reference", () => {
    const [move] = householdOpeningMoves("w", "owner 2026-10-18", [{ ...wallet, walletId: "hh" }]);
    expect(move.key).toBe("producer-household-opening:w:hh");
    expect(move.turn).toBeUndefined();
    expect(() => householdOpeningMoves("w", " ", [wallet])).toThrow(/approval/);
  });

  it("books each side of a cross-currency close transfer in its own currency", () => {
    const [move] = closeTransferMoves("w", 7, [
      {
        reason: "ai_dividend",
        amountAnchor: 10,
        from: {
          collection: "corporations",
          filter: { _id: "c" },
          path: "liquidCapital",
          id: "c",
          currencyCode: "GBP",
          localPerAnchor: 0.8,
        },
        to: {
          collection: "producerEconomyAccounts",
          filter: { _id: "hh" },
          path: "cash",
          id: "hh",
          currencyCode: "USD",
          localPerAnchor: 1,
        },
      },
    ]);
    expect(move.key).toBe("producer-close:w:7:ai_dividend:c");
    expect(move.legs.map((l) => [l.kind, l.amount])).toEqual([
      ["debit", 8],
      ["credit", 10],
    ]);
    expect(Math.abs(legsNet(move.legs))).toBeLessThan(1e-9);
  });
});

describe("transition support moves", () => {
  it("moves unspent public funding to the sector owner, keyed per sector and turn", () => {
    const side = (id: string, currencyCode: string, localPerAnchor: number) => ({
      collection: "c",
      filter: { _id: id },
      path: "cash",
      id,
      currencyCode,
      localPerAnchor,
    });
    const [move] = transitionSupportMoves("w", 9, [
      {
        payeeKey: "s1",
        amountAnchor: 5,
        from: side("pub", "USD", 1),
        to: side("corp", "GBP", 0.8),
      },
      {
        payeeKey: "s2",
        amountAnchor: 0,
        from: side("pub", "USD", 1),
        to: side("corp", "GBP", 0.8),
      },
    ]);
    expect(move.key).toBe("producer-transition:w:9:s1");
    expect(move.legs.map((l) => [l.kind, l.amount])).toEqual([
      ["debit", 5],
      ["credit", 4],
    ]);
    expect(Math.abs(legsNet(move.legs))).toBeLessThan(1e-9);
  });
});
