import { describe, expect, it } from "vitest";
import { checkBalancedTransfer } from "@/lib/banking/rules/invariants";
import { producerCashTransition, type ProducerCashBinding } from "./cashSettlementRules";

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

  it("has no cash legs when within-corporation deliveries change no money", () => {
    const { opening } = args();
    expect(producerCashTransition({ ...args(), closing: opening }).legs).toEqual([]);
  });
});
