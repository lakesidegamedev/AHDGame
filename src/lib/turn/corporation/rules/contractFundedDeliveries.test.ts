import { describe, expect, it } from "vitest";
import {
  fundedContractDeliveries,
  fundedContractTradesOf,
  fundedPairFlowKey,
  fundedPairFlows,
  fundedPairKeysOf,
  realisedSupplierPrices,
  type FundedContractTrade,
} from "./contractFundedDeliveries";
import type { ProducerTradeReceipt } from "@/lib/market/producerMarket/rules";

const sale = (
  seller: string,
  buyer: string,
  units: number,
  extra: Partial<FundedContractTrade> = {}
): FundedContractTrade => ({
  kind: "sale",
  sellerAccountId: seller,
  buyerAccountId: buyer,
  commodity: "steel",
  units,
  ...extra,
});

describe("fundedPairFlows", () => {
  it("sums sales between the pair and ignores own-site transfers and other buyers", () => {
    const flows = fundedPairFlows([
      sale("S", "B", 2),
      sale("S", "B", 3),
      sale("S", "X", 50),
      sale("S", "S", 40),
      sale("S", "B", 9, { kind: "internalTransfer" }),
      sale("S", "B", 7, { commodity: "energy" }),
    ]);
    expect(flows.get(fundedPairFlowKey("S", "B", "steel"))).toBe(5);
    expect(flows.get(fundedPairFlowKey("S", "B", "energy"))).toBe(7);
    expect(flows.get(fundedPairFlowKey("S", "S", "steel"))).toBeUndefined();
  });

  it("also books sales under the selling plant's state", () => {
    const flows = fundedPairFlows([
      sale("S", "B", 2, { sellerStateId: "TX" }),
      sale("S", "B", 3, { sellerStateId: "NY" }),
    ]);
    expect(flows.get(fundedPairFlowKey("S", "B", "steel"))).toBe(5);
    expect(flows.get(fundedPairFlowKey("S", "B", "steel@TX"))).toBe(2);
  });

  it("keeps only the requested pairs", () => {
    const pairs = fundedPairKeysOf([
      { supplierCorpId: "S", buyerCorpId: "B", commodity: "steel", volumeCap: 1 },
    ]);
    const flows = fundedPairFlows([sale("S", "B", 1), sale("T", "B", 1)], pairs);
    expect([...flows.keys()]).toEqual([fundedPairFlowKey("S", "B", "steel")]);
  });
});

describe("fundedContractDeliveries", () => {
  const flows = (entries: [string, number][]) =>
    new Map(entries.map(([scope, units]) => [fundedPairFlowKey("S", "B", scope), units]));

  it("credits the pair's per-turn trade on the daily basis", () => {
    const out = fundedContractDeliveries({
      agreements: [{ supplierCorpId: "S", buyerCorpId: "B", commodity: "steel", volumeCap: 100 }],
      flows: flows([["steel", 2]]),
      turnsPerDay: 24,
    });
    expect(out.get(0)).toBe(48);
  });

  it("caps the credit at the contracted volume", () => {
    const out = fundedContractDeliveries({
      agreements: [{ supplierCorpId: "S", buyerCorpId: "B", commodity: "steel", volumeCap: 30 }],
      flows: flows([["steel", 10]]),
      turnsPerDay: 24,
    });
    expect(out.get(0)).toBe(30);
  });

  it("credits nothing to a pair that never traded", () => {
    const out = fundedContractDeliveries({
      agreements: [{ supplierCorpId: "S", buyerCorpId: "B", commodity: "steel", volumeCap: 30 }],
      flows: new Map([[fundedPairFlowKey("S", "OTHER", "steel"), 10]]),
      turnsPerDay: 24,
    });
    expect(out.get(0)).toBe(0);
  });

  it("splits one pair's delivery across its contracts by volume cap, each capped", () => {
    const agreements = [
      { supplierCorpId: "S", buyerCorpId: "B", commodity: "steel", volumeCap: 100 },
      { supplierCorpId: "S", buyerCorpId: "B", commodity: "steel", volumeCap: 300 },
    ];
    const half = fundedContractDeliveries({
      agreements,
      flows: flows([["steel", 200 / 24]]),
      turnsPerDay: 24,
    });
    expect(half.get(0)).toBeCloseTo(50);
    expect(half.get(1)).toBeCloseTo(150);
    const over = fundedContractDeliveries({
      agreements,
      flows: flows([["steel", 1000 / 24]]),
      turnsPerDay: 24,
    });
    expect(over.get(0)).toBe(100);
    expect(over.get(1)).toBe(300);
  });

  it("credits a state contract from its state, and a wide contract only from the rest", () => {
    const out = fundedContractDeliveries({
      agreements: [
        {
          supplierCorpId: "S",
          buyerCorpId: "B",
          commodity: "freight",
          stateId: "TX",
          volumeCap: 24,
        },
        { supplierCorpId: "S", buyerCorpId: "B", commodity: "freight", volumeCap: 1000 },
      ],
      flows: flows([
        ["freight", 5],
        ["freight@TX", 3],
      ]),
      turnsPerDay: 24,
    });
    expect(out.get(0)).toBe(24);
    // 5 × 24 = 120 in total, 24 already credited to the Texas contract.
    expect(out.get(1)).toBe(96);
  });

  it("does not share deliveries between different buyers", () => {
    const out = fundedContractDeliveries({
      agreements: [
        { supplierCorpId: "S", buyerCorpId: "B", commodity: "steel", volumeCap: 100 },
        { supplierCorpId: "S", buyerCorpId: "C", commodity: "steel", volumeCap: 100 },
      ],
      flows: flows([["steel", 1]]),
      turnsPerDay: 24,
    });
    expect(out.get(0)).toBe(24);
    expect(out.get(1)).toBe(0);
  });
});

describe("fundedContractTradesOf", () => {
  it("replays a settled receipt into seller-to-buyer trades with the seller's state", () => {
    const receipt: ProducerTradeReceipt = {
      turn: 7,
      offers: [
        {
          id: "o1",
          accountId: "S",
          commodity: "steel",
          book: "global",
          units: 10,
          unitPrice: 5,
          stateId: "TX",
          countryId: "US",
        },
      ],
      orders: [
        {
          id: "d1",
          accountId: "B",
          commodity: "steel",
          book: "global",
          units: 4,
          maxUnitPrice: 10,
        },
      ],
      fills: [{ orderId: "d1", kind: "sale", unitPrice: 5, units: 4 }],
      tradeCount: 1,
    } as unknown as ProducerTradeReceipt;
    const trades = [...fundedContractTradesOf(receipt)];
    expect(trades).toEqual([
      {
        kind: "sale",
        sellerAccountId: "S",
        buyerAccountId: "B",
        commodity: "steel",
        units: 4,
        amount: 20,
        sellerStateId: "TX",
      },
    ]);
  });
});

describe("realisedSupplierPrices", () => {
  it("averages what a supplier's units cleared for, by commodity and state", () => {
    const prices = realisedSupplierPrices([
      {
        kind: "sale",
        sellerAccountId: "S",
        buyerAccountId: "B",
        commodity: "steel",
        units: 2,
        amount: 10,
        sellerStateId: "TX",
      },
      {
        kind: "sale",
        sellerAccountId: "S",
        buyerAccountId: "C",
        commodity: "steel",
        units: 2,
        amount: 14,
        sellerStateId: "OH",
      },
      {
        kind: "internalTransfer",
        sellerAccountId: "S",
        buyerAccountId: "S",
        commodity: "steel",
        units: 9,
        amount: 0,
      },
    ]);
    expect(prices.get("S")?.get("steel")).toBe(6);
    expect(prices.get("S")?.get("steel@TX")).toBe(5);
    expect(prices.get("S")?.get("steel@OH")).toBe(7);
  });
});
