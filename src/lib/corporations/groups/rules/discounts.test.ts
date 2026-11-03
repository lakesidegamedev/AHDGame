import { describe, expect, it } from "vitest";
import { clampGroupDiscount, settleGroupDiscounts } from "./discounts";
import { SUPPLY_AGREEMENT_PRICE_BAND } from "@/lib/db/types/supplyAgreement";
import type { GroupMarketReceipt } from "./marketCoordination";
const receipt: GroupMarketReceipt = {
  supplierId: "s",
  supplierSectorId: "ss",
  buyerId: "b",
  buyerSectorId: "bb",
  commodity: "iron",
  units: 100,
  amountAnchor: 200,
  discount: 0.35,
};
const quantity = (id: string, n: number) => new Map([[id, new Map([["iron", n]])]]);
describe("Group Chain matched consumption discounts", () => {
  it("uses the agreement band and fails closed on non-finite settings", () => {
    expect(clampGroupDiscount(1)).toBe(SUPPLY_AGREEMENT_PRICE_BAND);
    for (const v of [undefined, NaN, Infinity, -1]) expect(clampGroupDiscount(v)).toBe(0);
  });
  it("subtracts contracted consumption and matches both legs exactly", () => {
    const costs = settleGroupDiscounts(
      [receipt],
      quantity("bb", 75),
      quantity("bb", 25),
      quantity("ss", 100)
    );
    expect(costs.get("ss")).toBe(35);
    expect(costs.get("bb")).toBe(-35);
    expect([...costs.values()].reduce((a, b) => a + b, 0)).toBe(0);
  });
  it("caps by actual supplier output after contracts and never discounts missing output", () => {
    expect(settleGroupDiscounts([receipt], quantity("bb", 100))).toEqual(new Map());
    const costs = settleGroupDiscounts(
      [receipt],
      quantity("bb", 100),
      undefined,
      quantity("ss", 60),
      quantity("ss", 40)
    );
    expect(costs.get("ss")).toBe(14);
  });
  it("shares a buyer consumption ceiling across suppliers", () => {
    const receipts = [receipt, { ...receipt, supplierSectorId: "ss2" }];
    const production = new Map([...quantity("ss", 100), ...quantity("ss2", 100)]);
    const costs = settleGroupDiscounts(receipts, quantity("bb", 50), undefined, production);
    expect(costs.get("ss")).toBe(17.5);
    expect(costs.get("ss2")).toBe(17.5);
    expect(costs.get("bb")).toBe(-35);
  });
  it("never rebills base value or unused allocations", () => {
    for (const n of [0, NaN, Infinity])
      expect(
        settleGroupDiscounts([receipt], quantity("bb", n), undefined, quantity("ss", 100))
      ).toEqual(new Map());
    expect(
      settleGroupDiscounts(
        [{ ...receipt, discount: 0 }],
        quantity("bb", 100),
        undefined,
        quantity("ss", 100)
      )
    ).toEqual(new Map());
  });
});

it("rejects malformed zero or negative quantity receipts even when a value is present", () => {
  for (const units of [0, -1, NaN, Infinity])
    expect(
      settleGroupDiscounts(
        [{ ...receipt, units }],
        quantity("bb", 100),
        undefined,
        quantity("ss", 100)
      )
    ).toEqual(new Map());
});

/** The implementation before the keys were concatenated instead of stringified. */
function legacySettleGroupDiscounts(
  receipts: readonly GroupMarketReceipt[],
  consumption: ReadonlyMap<string, ReadonlyMap<string, number>>,
  committed?: ReadonlyMap<string, ReadonlyMap<string, number>>,
  production?: ReadonlyMap<string, ReadonlyMap<string, number>>,
  committedOutput?: ReadonlyMap<string, ReadonlyMap<string, number>>
): Map<string, number> {
  const reserved = new Map<string, number>();
  const key = (buyer: string, commodity: string) => JSON.stringify([buyer, commodity]);
  const positive = (n: number | undefined) => (n != null && Number.isFinite(n) && n > 0 ? n : 0);
  for (const r of receipts) {
    const k = key(r.buyerSectorId, r.commodity);
    reserved.set(k, (reserved.get(k) ?? 0) + positive(r.units));
  }
  const supplied = new Map<string, number>();
  for (const r of receipts) {
    const k = key(r.supplierSectorId, r.commodity);
    supplied.set(k, (supplied.get(k) ?? 0) + positive(r.units));
  }
  const costs = new Map<string, number>();
  for (const r of receipts) {
    if (!(positive(r.units) > 0 && positive(r.amountAnchor) > 0)) continue;
    const actual = Math.max(
      0,
      positive(consumption.get(r.buyerSectorId)?.get(r.commodity)) -
        positive(committed?.get(r.buyerSectorId)?.get(r.commodity))
    );
    const fraction = Math.min(1, actual / (reserved.get(key(r.buyerSectorId, r.commodity)) || 1));
    const available = Math.max(
      0,
      positive(production?.get(r.supplierSectorId)?.get(r.commodity)) -
        positive(committedOutput?.get(r.supplierSectorId)?.get(r.commodity))
    );
    const outputFraction = Math.min(
      1,
      available / (supplied.get(key(r.supplierSectorId, r.commodity)) || 1)
    );
    const rebate =
      positive(r.amountAnchor) *
      clampGroupDiscount(r.discount) *
      Math.min(fraction, outputFraction);
    if (!(rebate > 0)) continue;
    costs.set(r.supplierSectorId, (costs.get(r.supplierSectorId) ?? 0) + rebate);
    costs.set(r.buyerSectorId, (costs.get(r.buyerSectorId) ?? 0) - rebate);
  }
  return costs;
}

describe("settleGroupDiscounts lane keys", () => {
  /** A group book: 60 member corps, each buying and selling two commodities. */
  const commodities = ["steel", "food"] as const;
  const receipts: GroupMarketReceipt[] = [];
  const consumption = new Map<string, Map<string, number>>();
  const committed = new Map<string, Map<string, number>>();
  const production = new Map<string, Map<string, number>>();
  const committedOutput = new Map<string, Map<string, number>>();
  for (let i = 0; i < 60; i += 1) {
    const supplierSectorId = `6a1f${i.toString(16).padStart(4, "0")}`;
    const buyerSectorId = `6a1f${(i + 60).toString(16).padStart(4, "0")}`;
    for (const commodity of commodities) {
      receipts.push({
        supplierId: `corp-${i}`,
        supplierSectorId,
        buyerId: `corp-${(i + 1) % 60}`,
        buyerSectorId,
        commodity,
        units: 10 + (i % 7),
        amountAnchor: 120 + i * 3,
        discount: [0, 0.05, 0.12, 0.35][i % 4]!,
      });
      const bought = consumption.get(buyerSectorId) ?? new Map<string, number>();
      bought.set(commodity, 6 + (i % 5));
      consumption.set(buyerSectorId, bought);
      const prior = committed.get(buyerSectorId) ?? new Map<string, number>();
      prior.set(commodity, i % 3 === 0 ? 1.5 : 0);
      committed.set(buyerSectorId, prior);
      const made = production.get(supplierSectorId) ?? new Map<string, number>();
      made.set(commodity, 12 + (i % 4));
      production.set(supplierSectorId, made);
      const reserved = committedOutput.get(supplierSectorId) ?? new Map<string, number>();
      reserved.set(commodity, i % 5 === 0 ? 2 : 0);
      committedOutput.set(supplierSectorId, reserved);
    }
  }

  it("charges the same legs as the stringified keys, receipt for receipt", () => {
    const current = settleGroupDiscounts(
      receipts,
      consumption,
      committed,
      production,
      committedOutput
    );
    const legacy = legacySettleGroupDiscounts(
      receipts,
      consumption,
      committed,
      production,
      committedOutput
    );
    expect([...current.entries()]).toEqual([...legacy.entries()]);
    expect(current.size).toBeGreaterThan(60);
  });

  it("separates a buyer leg from a supplier leg on the same sector id", () => {
    const selfDealing = [{ ...receipt, supplierSectorId: "same", buyerSectorId: "same" }];
    const current = settleGroupDiscounts(
      selfDealing,
      new Map([["same", new Map([["iron", 50]])]]),
      undefined,
      new Map([["same", new Map([["iron", 100]])]])
    );
    expect([...current.entries()]).toEqual([
      ...legacySettleGroupDiscounts(
        selfDealing,
        new Map([["same", new Map([["iron", 50]])]]),
        undefined,
        new Map([["same", new Map([["iron", 100]])]])
      ).entries(),
    ]);
    expect(current.get("same")).toBe(0);
  });
});
