import { describe, it, expect } from "vitest";
import { ObjectId } from "mongodb";
import { COMMODITY_BASE_PRICES, type CommodityType } from "@/lib/constants/commodities";
import { computeSupplyAgreementSettlements, type SettleCorpInfo } from "./settleSupplyAgreements";
import type { SettleableSupplyAgreement } from "./settleSupplyAgreementsAllocation";

const now = new Date("2026-01-01T00:00:00Z");
const commodity = Object.keys(COMMODITY_BASE_PRICES)[0] as CommodityType;
const supId = new ObjectId();
const buyId = new ObjectId();
const S = supId.toString();
const B = buyId.toString();
const info = (id: string): SettleCorpInfo | undefined =>
  id === S
    ? { _id: supId, name: "Sup", ccy: "USD" as never, fxRate: 1 }
    : id === B
      ? { _id: buyId, name: "Buy", ccy: "USD" as never, fxRate: 1 }
      : undefined;

// 2400 daily-basis units is 100 units in one turn.
const DAILY = 2400;

function settle(
  agreement: Partial<SettleableSupplyAgreement>,
  extra: Partial<Parameters<typeof computeSupplyAgreementSettlements>[0]> = {}
) {
  return computeSupplyAgreementSettlements({
    agreements: [
      {
        agreementId: "a1",
        supplierCorpId: S,
        buyerCorpId: B,
        commodity,
        volumeCap: DAILY,
        pricePremium: 0,
        ...agreement,
      },
    ],
    contractSettlementByCorp: new Map([[S, new Map([[commodity, DAILY]])]]),
    buyerDemandByCorpCommodity: new Map([[B, new Map([[commodity, DAILY]])]]),
    priceRatioByCommodity: new Map([[commodity, 1]]),
    eraUnitScale: 1,
    corpInfo: info,
    turn: 7,
    now,
    ...extra,
  });
}

const realised = (price: number) => new Map([[S, new Map([[commodity, price]])]]);

describe("fixed price settlement", () => {
  it("pays the gap up to the set price when the market is below it", () => {
    const r = settle(
      { priceMode: "fixed", fixedUnitPrice: 100, pricePremium: 0.25 },
      { realisedSupplierPrices: realised(80) }
    );
    // 100 units a turn at (100 - 80): the seller nets exactly 100 a unit.
    expect(r.deltaByCorp.get(S)).toBeCloseTo(2000);
    expect(r.deltaByCorp.get(B)).toBeCloseTo(-2000);
  });

  it("has the seller pay the buyer when the market is above the set price", () => {
    const r = settle(
      { priceMode: "fixed", fixedUnitPrice: 100 },
      { realisedSupplierPrices: realised(120) }
    );
    expect(r.deltaByCorp.get(S)).toBeCloseTo(-2000);
    expect(r.deltaByCorp.get(B)).toBeCloseTo(2000);
  });

  it("books ledger rows that name the mode, price source and prices, and conserves cash", () => {
    const r = settle(
      { priceMode: "fixed", fixedUnitPrice: 100 },
      { realisedSupplierPrices: realised(80) }
    );
    expect(r.txEntries).toHaveLength(2);
    expect(r.txEntries[0]!.meta).toMatchObject({
      priceMode: "fixed",
      marketPriceSource: "realised",
      marketUnitPrice: 80,
      contractUnitPrice: 100,
    });
    expect((r.deltaByCorp.get(S) ?? 0) + (r.deltaByCorp.get(B) ?? 0)).toBeCloseTo(0);
    expect(r.deliveries[0]).toMatchObject({
      marketUnitPrice: 80,
      marketPriceSource: "realised",
      contractUnitPrice: 100,
    });
  });

  it("falls back to the published price and says so when the lane has no realised price", () => {
    const published = COMMODITY_BASE_PRICES[commodity];
    const r = settle({ priceMode: "fixed", fixedUnitPrice: published + 10 });
    expect(r.deltaByCorp.get(S)).toBeCloseTo(100 * 10);
    expect(r.txEntries[0]!.meta).toMatchObject({ marketPriceSource: "published" });
    expect(r.deliveries[0]).toMatchObject({ marketPriceSource: "published" });
  });

  it("values shortfall damages at the contract price", () => {
    const r = settle(
      { priceMode: "fixed", fixedUnitPrice: 100 },
      {
        realisedSupplierPrices: realised(100),
        plantsEnabled: true,
        producedByCorpCommodity: new Map([[S, new Map([[commodity, 2000]])]]),
      }
    );
    // 400 daily units short at 100 a unit over 24 turns, at half rate.
    expect(r.deltaByCorp.get(S)).toBeCloseTo(-((400 * 100 * 0.5) / 24));
    expect(r.damages[0]!.penaltyAnchor).toBeCloseTo((400 * 100 * 0.5) / 24, 6);
  });
});

describe("market price plus or minus settlement", () => {
  it("moves the agreed percentage of the market price to the seller", () => {
    const r = settle(
      { priceMode: "indexed", pricePremium: 0.1 },
      { realisedSupplierPrices: realised(80) }
    );
    expect(r.deltaByCorp.get(S)).toBeCloseTo(800);
    expect(r.deltaByCorp.get(B)).toBeCloseTo(-800);
    expect(r.txEntries[0]!.meta).toMatchObject({ priceMode: "indexed", contractUnitPrice: 88 });
  });

  it("moves money to the buyer on a negative percentage", () => {
    const r = settle(
      { priceMode: "indexed", pricePremium: -0.2 },
      { realisedSupplierPrices: realised(50) }
    );
    expect(r.deltaByCorp.get(S)).toBeCloseTo(-1000);
    expect(r.deltaByCorp.get(B)).toBeCloseTo(1000);
  });
});

describe("legacy agreements", () => {
  it("still settle a premium on the billed input price and carry no price-mode fields", () => {
    const base = COMMODITY_BASE_PRICES[commodity];
    const r = settle({ pricePremium: 0.2 }, { realisedSupplierPrices: realised(5) });
    expect(r.deltaByCorp.get(S)).toBeCloseTo(100 * base * 0.2);
    expect(r.txEntries[0]!.meta).not.toHaveProperty("priceMode");
    expect(r.deliveries[0]).not.toHaveProperty("marketUnitPrice");
  });
});
