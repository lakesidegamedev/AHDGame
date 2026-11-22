import { describe, expect, it } from "vitest";
import { checkBalancedTransfer } from "@/lib/banking/rules/invariants";
import {
  producerCashTransition,
  ProducerCashOverdrawError,
  type ProducerCashBinding,
} from "./cashSettlementRules";

const bindings: ProducerCashBinding[] = [
  {
    accountId: "buyer",
    kind: "economyAccount",
    economyAccountId: "households:example",
    currency: "USD",
    localPerAnchor: 2,
    openingCashLocal: 200,
  },
  {
    accountId: "seller",
    kind: "corporation",
    corporationId: "aaaaaaaaaaaaaaaaaaaaaaaa",
    currency: "JPY",
    localPerAnchor: 100,
    openingCashLocal: 2000,
  },
];
const args = () => ({
  worldEpoch: "example",
  turn: 1,
  receiptDigest: "a".repeat(64),
  bindings,
  opening: [
    { id: "buyer", cash: 100 },
    { id: "seller", cash: 20 },
  ],
  closing: [
    { id: "buyer", cash: 70 },
    { id: "seller", cash: 50 },
  ],
});

describe("closed producer cash settlement", () => {
  it("debits and credits native balances at frozen rates without a mint or a bank-vault target", () => {
    const receipt = producerCashTransition(args());
    expect(receipt.legs.map((leg) => [leg.kind, leg.amount, leg.path])).toEqual([
      ["debit", 60, "cash"],
      ["credit", 3000, "liquidCapital"],
    ]);
    expect(checkBalancedTransfer(receipt.legs, receipt.key)).toEqual([]);
    expect(receipt.event.meta?.receiptDigest).toBe("a".repeat(64));
    expect(receipt.key).toBe("producer-economy:example:1");
  });

  it("refuses invented money, missing accounts, overlapping targets and changed participants", () => {
    expect(() =>
      producerCashTransition({
        ...args(),
        closing: [
          { id: "buyer", cash: 70 },
          { id: "seller", cash: 51 },
        ],
      })
    ).toThrow("conserve");
    expect(() => producerCashTransition({ ...args(), bindings: [bindings[0]] })).toThrow("Missing");
    expect(() =>
      producerCashTransition({
        ...args(),
        bindings: [bindings[0], { ...bindings[0], accountId: "seller", openingCashLocal: 40 }],
      })
    ).toThrow("same cash");
    expect(() =>
      producerCashTransition({ ...args(), closing: [{ id: "other", cash: 120 }] })
    ).toThrow("participants");
  });

  it("debits a fully spent balance exactly, not a float overshoot the guard refuses", () => {
    const rate = 5.623705334854198;
    const local = 3064.6333514475377;
    const spent = local / rate;
    expect(spent * rate).toBeGreaterThan(local);
    const receipt = producerCashTransition({
      ...args(),
      bindings: [
        { ...bindings[1], localPerAnchor: rate, openingCashLocal: local },
        { ...bindings[0], localPerAnchor: 1, openingCashLocal: 0 },
      ],
      opening: [
        { id: "seller", cash: spent },
        { id: "buyer", cash: 0 },
      ],
      closing: [
        { id: "seller", cash: 0 },
        { id: "buyer", cash: spent },
      ],
    });
    expect(receipt.legs.find((leg) => leg.kind === "debit")?.amount).toBe(local);
  });

  it("drops pro-rata dust debited from a company already below zero instead of stopping the turn", () => {
    // Live t135: a company stored at -130,308 USD has 0 to spend; a 1e-11 anchor
    // residue from clearing must not read as an overdraw of its whole deficit.
    const receipt = producerCashTransition({
      ...args(),
      bindings: [
        { ...bindings[1], openingCashLocal: -130308.17513509704 },
        { ...bindings[0], openingCashLocal: 200 },
      ],
      opening: [
        { id: "seller", cash: 0 },
        { id: "buyer", cash: 100 },
      ],
      closing: [
        { id: "seller", cash: 0 },
        { id: "buyer", cash: 100 + 1e-11 },
      ],
      cashChanges: [
        { accountId: "seller", change: -1e-11 },
        { accountId: "buyer", change: 1e-11 },
      ],
    });
    expect(receipt.legs.filter((leg) => leg.kind === "debit")).toEqual([]);
    expect(checkBalancedTransfer(receipt.legs, receipt.key)).toEqual([]);
  });

  it("names every account a settlement would overdraw", () => {
    let caught: unknown;
    try {
      producerCashTransition({
        ...args(),
        closing: [
          { id: "buyer", cash: 0 },
          { id: "seller", cash: 120 },
        ],
        opening: [
          { id: "buyer", cash: 100 },
          { id: "seller", cash: 20 },
        ],
        cashChanges: [
          { accountId: "buyer", change: -100 },
          { accountId: "seller", change: 100 },
        ],
        bindings: [{ ...bindings[0], openingCashLocal: 200 }, bindings[1]],
      });
      producerCashTransition({
        ...args(),
        bindings: [{ ...bindings[0], openingCashLocal: -50 }, bindings[1]],
        opening: [
          { id: "buyer", cash: 0 },
          { id: "seller", cash: 20 },
        ],
        closing: [
          { id: "buyer", cash: 0 },
          { id: "seller", cash: 50 },
        ],
        cashChanges: [
          { accountId: "buyer", change: -30 },
          { accountId: "seller", change: 30 },
        ],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProducerCashOverdrawError);
    expect((caught as ProducerCashOverdrawError).overdrawn.map((o) => o.accountId)).toEqual([
      "buyer",
    ]);
  });

  it("has no cash legs when within-corporation deliveries change no money", () => {
    const { opening } = args();
    expect(producerCashTransition({ ...args(), closing: opening }).legs).toEqual([]);
  });

  it.each([
    { buyerCurrency: "USD", buyerRate: 1, sellerCurrency: "USD", sellerRate: 1 },
    { buyerCurrency: "TRY", buyerRate: 33.891, sellerCurrency: "JPY", sellerRate: 133.7 },
  ])("settles small witnessed payments beside a trillion-sized $buyerCurrency balance", (fx) => {
    const amount = 0.1;
    const opening = [
      { id: "buyer", cash: 6e12 },
      { id: "seller", cash: 20 },
    ];
    const closing = [
      { id: "buyer", cash: 6e12 - amount },
      { id: "seller", cash: 20 + amount },
    ];
    const input = {
      ...args(),
      opening,
      closing,
      bindings: [
        {
          ...bindings[0],
          currency: fx.buyerCurrency,
          localPerAnchor: fx.buyerRate,
          openingCashLocal: 6e12 * fx.buyerRate,
        },
        {
          ...bindings[1],
          currency: fx.sellerCurrency,
          localPerAnchor: fx.sellerRate,
          openingCashLocal: 20 * fx.sellerRate,
        },
      ],
    };
    expect(() => producerCashTransition(input)).toThrow("conserve");
    const cashChanges = [
      { accountId: "buyer", change: -amount },
      { accountId: "seller", change: amount },
    ];
    const receipt = producerCashTransition({ ...input, cashChanges });
    expect(checkBalancedTransfer(receipt.legs, receipt.key)).toEqual([]);
    expect(receipt.legs.map((leg) => leg.amount)).toEqual([
      amount * fx.buyerRate,
      amount * fx.sellerRate,
    ]);
    expect(() =>
      producerCashTransition({
        ...input,
        cashChanges: [{ ...cashChanges[0], change: -amount + 0.00001 }, cashChanges[1]],
      })
    ).toThrow("conserve");
    expect(() =>
      producerCashTransition({
        ...input,
        cashChanges,
        closing: [{ ...closing[0], cash: closing[0].cash + 0.01 }, closing[1]],
      })
    ).toThrow("closing snapshot");
    expect(() =>
      producerCashTransition({ ...input, cashChanges: [cashChanges[0], cashChanges[0]] })
    ).toThrow("witness");
    expect(() => producerCashTransition({ ...input, cashChanges: [cashChanges[0]] })).toThrow(
      "participants"
    );
    expect(() =>
      producerCashTransition({
        ...input,
        cashChanges: [cashChanges[0], { accountId: "unknown", change: amount }],
      })
    ).toThrow("participants");
  });
});
