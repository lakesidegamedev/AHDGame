import { describe, expect, it } from "vitest";
import { legsNet } from "@/lib/banking/moneyMove";
import {
  batchProducerMoves,
  closeTransferMoves,
  householdOpeningMoves,
  householdTransferMoves,
  investmentFundingMoves,
  investmentReturnMoves,
  publicFundingMoves,
  producerMoveLedgerLegs,
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

describe("ledger witness for producer moves", () => {
  it("balances a mint against a named mint account and names wallet and company legs", () => {
    const [mint] = publicFundingMoves("w", 7, [{ ...wallet, countryId: "us" }]);
    const legs = producerMoveLedgerLegs(mint)!;
    expect(legs.map((l) => l.account)).toEqual([
      "mint:producer_public_funding:USD",
      "economy_wallet:pub-us:USD",
    ]);
    expect(legs.reduce((sum, l) => sum + l.anchorAmount, 0)).toBeCloseTo(0);
    const [burn] = publicReturnMoves("w", 7, [{ ...wallet, countryId: "us" }]);
    const burnLegs = producerMoveLedgerLegs(burn)!;
    expect(burnLegs.map((l) => l.account)).toEqual([
      "economy_wallet:pub-us:USD",
      "sink:producer_public_return:USD",
    ]);
    expect(burnLegs.reduce((sum, l) => sum + l.anchorAmount, 0)).toBeCloseTo(0);
  });

  it("batches one kind of per-country move into one deterministic move with the same legs", () => {
    const rows = [
      { ...wallet, countryId: "us" },
      { ...wallet, walletId: "pub-gb", countryId: "gb", currencyCode: "GBP", localPerAnchor: 0.6 },
      { ...wallet, walletId: "pub-jp", countryId: "jp", currencyCode: "JPY", localPerAnchor: 125 },
    ];
    const single = publicFundingMoves("w", 7, rows);
    const [batch] = batchProducerMoves("w", 7, single);
    expect(batchProducerMoves("w", 7, single)[0].key).toBe(batch.key);
    expect(batch.key).toBe("producer_public_funding-batch:w:7");
    expect(batch.record).toEqual({ batchIndependentDebits: true });
    expect(batch.legs).toEqual(single.flatMap((m) => m.legs));
    expect(legsNet(batch.legs)).toBeCloseTo(
      single.reduce((n, m) => n + legsNet(m.legs), 0),
      9
    );
    const witness = producerMoveLedgerLegs(batch)!;
    const singleWitness = single.flatMap((m) => producerMoveLedgerLegs(m)!);
    expect(witness.reduce((n, l) => n + l.anchorAmount, 0)).toBeCloseTo(0, 9);
    expect(witness.map((l) => [l.account, l.amount]).sort()).toEqual(
      singleWitness.map((l) => [l.account, l.amount]).sort()
    );
  });

  it("refuses a batch that repeats an account, mixes kinds or turns, and skips empty input", () => {
    expect(batchProducerMoves("w", 7, [])).toEqual([]);
    const dup = publicReturnMoves("w", 7, [
      { ...wallet, countryId: "us" },
      { ...wallet, countryId: "gb" },
    ]);
    expect(() => batchProducerMoves("w", 7, dup)).toThrow(/repeats account/);
    const mixed = [
      ...publicFundingMoves("w", 7, [{ ...wallet, countryId: "us" }]),
      ...investmentFundingMoves("w", 7, [{ ...wallet, walletId: "inv-us", countryId: "us" }]),
    ];
    expect(() => batchProducerMoves("w", 7, mixed)).toThrow(/Cannot batch/);
    expect(() =>
      batchProducerMoves("w", 8, publicFundingMoves("w", 7, [{ ...wallet, countryId: "us" }]))
    ).toThrow(/turn 7/);
  });
});

describe("household transfer moves", () => {
  it("mint into one wallet each, balance in the ledger, and batch into one move", () => {
    const rows = [
      { walletId: "hh-a", amountLocal: 30, currencyCode: "USD", localPerAnchor: 1 },
      { walletId: "hh-b", amountLocal: 0, currencyCode: "USD", localPerAnchor: 1 },
      { walletId: "hh-c", amountLocal: 20, currencyCode: "USD", localPerAnchor: 1 },
    ];
    const moves = householdTransferMoves("w", 7, rows);
    expect(moves.map((m) => m.key)).toEqual([
      "producer-household-transfer:w:7:hh-a",
      "producer-household-transfer:w:7:hh-c",
    ]);
    for (const move of moves) {
      expect(legsNet(move.legs)).toBeCloseTo(0, 12);
      const ledger = producerMoveLedgerLegs(move)!;
      expect(ledger.reduce((sum, leg) => sum + leg.anchorAmount, 0)).toBeCloseTo(0, 12);
    }
    const batch = batchProducerMoves("w", 7, moves);
    expect(batch).toHaveLength(1);
    expect(batch[0].kind).toBe("producer_household_transfer");
  });
});
