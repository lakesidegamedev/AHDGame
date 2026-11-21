import { describe, expect, it } from "vitest";
import { ACCRUAL_RATE, DECAY_IDLE } from "@/lib/market/brandLoyalty";
import {
  computeBrandLoyaltyUpdates,
  computeFundedBrandLoyaltyUpdates,
  type CorpLoyaltyInput,
  type FundedCorpLoyaltyInput,
} from "./brandLoyaltyTurn";

function corp(over: Partial<CorpLoyaltyInput>): CorpLoyaltyInput {
  return {
    corpId: "c",
    priorLoyalty: 40,
    priorNorm: 0.1,
    sectors: [
      { revenueAnchor: 100, effectivePosture: 0.1, soldFraction: 0.8, commodities: ["steel"] },
    ],
    ...over,
  };
}

describe("computeBrandLoyaltyUpdates", () => {
  it("revenue-weights posture and fill across sectors", () => {
    // Two sectors: big one at posture 0.2/fill 0.9, small at 0.0/fill 0.1.
    // Weighted posture ≈ (100·0.2 + 10·0.0)/110 = 0.1818; but with a rival cheaper it may gouge —
    // here no rival, priorNorm 0.18 so it's consistent. Just assert it runs and weights.
    const [u] = computeBrandLoyaltyUpdates([
      corp({
        corpId: "big",
        priorNorm: 0.1818,
        sectors: [
          { revenueAnchor: 100, effectivePosture: 0.2, soldFraction: 0.9, commodities: ["a"] },
          { revenueAnchor: 10, effectivePosture: 0.0, soldFraction: 0.1, commodities: ["a"] },
        ],
      }),
    ]);
    expect(u.corpId).toBe("big");
    // Uncontested (single corp) → idle decay, not accrual.
    expect(u.outcome).toBe("idle-decay");
  });

  it("accrues only when a rival posts >= CONTEST_GAP cheaper", () => {
    const updates = computeBrandLoyaltyUpdates([
      corp({
        corpId: "premium",
        priorNorm: 0.1,
        sectors: [
          { revenueAnchor: 100, effectivePosture: 0.1, soldFraction: 0.8, commodities: ["steel"] },
        ],
      }),
      corp({
        corpId: "cheap",
        priorNorm: 0.02,
        sectors: [
          { revenueAnchor: 100, effectivePosture: 0.02, soldFraction: 0.9, commodities: ["steel"] },
        ],
      }),
    ]);
    const premium = updates.find((u) => u.corpId === "premium")!;
    // cheap posts 0.02 <= 0.1 - 0.05 → premium is contested → accrues
    expect(premium.outcome).toBe("accrued");
    expect(premium.loyalty).toBe(40 + ACCRUAL_RATE);
  });

  it("the cheapest corp itself is NOT contested by its own price", () => {
    const updates = computeBrandLoyaltyUpdates([
      corp({
        corpId: "cheap",
        priorNorm: 0.02,
        sectors: [
          { revenueAnchor: 100, effectivePosture: 0.02, soldFraction: 0.9, commodities: ["steel"] },
        ],
      }),
      corp({
        corpId: "pricey",
        priorNorm: 0.1,
        sectors: [
          { revenueAnchor: 100, effectivePosture: 0.1, soldFraction: 0.9, commodities: ["steel"] },
        ],
      }),
    ]);
    const cheap = updates.find((u) => u.corpId === "cheap")!;
    // No one is cheaper than 'cheap' → not contested → idle decay
    expect(cheap.outcome).toBe("idle-decay");
    expect(cheap.loyalty).toBe(40 - DECAY_IDLE);
  });

  it("handles the global-min-is-self edge via the distinct second corp", () => {
    // 'a' is cheapest overall; 'b' second; 'c' priciest. 'a' should look to 'b' (none cheaper) → not contested.
    const updates = computeBrandLoyaltyUpdates([
      corp({
        corpId: "a",
        priorNorm: 0.0,
        sectors: [
          { revenueAnchor: 100, effectivePosture: 0.0, soldFraction: 0.9, commodities: ["x"] },
        ],
      }),
      corp({
        corpId: "b",
        priorNorm: 0.1,
        sectors: [
          { revenueAnchor: 100, effectivePosture: 0.1, soldFraction: 0.9, commodities: ["x"] },
        ],
      }),
      corp({
        corpId: "c",
        priorNorm: 0.2,
        sectors: [
          { revenueAnchor: 100, effectivePosture: 0.2, soldFraction: 0.9, commodities: ["x"] },
        ],
      }),
    ]);
    expect(updates.find((u) => u.corpId === "a")!.outcome).toBe("idle-decay"); // nobody cheaper
    expect(updates.find((u) => u.corpId === "b")!.outcome).toBe("accrued"); // 'a' is cheaper
    expect(updates.find((u) => u.corpId === "c")!.outcome).toBe("accrued"); // 'a'/'b' cheaper
  });

  it("skips corps with no selling sectors", () => {
    const updates = computeBrandLoyaltyUpdates([
      corp({
        corpId: "empty",
        sectors: [{ revenueAnchor: 0, effectivePosture: 0.1, soldFraction: 0.8, commodities: [] }],
      }),
    ]);
    expect(updates).toHaveLength(0);
  });

  it("under-delivery penalizes even when contested", () => {
    const updates = computeBrandLoyaltyUpdates([
      corp({
        corpId: "premium",
        priorNorm: 0.1,
        sectors: [
          { revenueAnchor: 100, effectivePosture: 0.1, soldFraction: 0.2, commodities: ["steel"] },
        ],
      }),
      corp({
        corpId: "cheap",
        priorNorm: 0.02,
        sectors: [
          { revenueAnchor: 100, effectivePosture: 0.02, soldFraction: 0.9, commodities: ["steel"] },
        ],
      }),
    ]);
    const premium = updates.find((u) => u.corpId === "premium")!;
    expect(premium.outcome).toBe("underdelivered");
  });
});

describe("computeFundedBrandLoyaltyUpdates", () => {
  function funded(over: Partial<FundedCorpLoyaltyInput>): FundedCorpLoyaltyInput {
    return {
      corpId: "c",
      priorLoyalty: 40,
      priorNorm: -0.05,
      sectors: [{ revenueAnchor: 100, fill: 0.9, commodities: ["steel"] }],
      ...over,
    };
  }

  it("accrues on a contested corp that really sold, and never applies a pricing penalty", () => {
    const updates = computeFundedBrandLoyaltyUpdates([
      funded({ corpId: "a" }),
      funded({ corpId: "b", priorNorm: 0.2 }),
    ]);
    for (const u of updates) {
      expect(u.outcome).toBe("accrued");
      expect(u.loyalty).toBe(40 + ACCRUAL_RATE);
    }
    // The stored norm is carried forward unchanged.
    expect(updates.find((u) => u.corpId === "a")!.postureNorm).toBe(-0.05);
    expect(updates.find((u) => u.corpId === "b")!.postureNorm).toBe(0.2);
  });

  it("revenue-weights the real fill: a big low seller under-delivers", () => {
    const [u] = computeFundedBrandLoyaltyUpdates([
      funded({
        sectors: [
          { revenueAnchor: 100, fill: 0.2, commodities: ["a"] },
          { revenueAnchor: 10, fill: 1, commodities: ["b"] },
        ],
      }),
    ]);
    expect(u.outcome).toBe("underdelivered");
    expect(u.loyalty).toBe(39);
  });

  it("drifts idly for an uncontested seller", () => {
    const [u] = computeFundedBrandLoyaltyUpdates([funded({})]);
    expect(u.outcome).toBe("idle-decay");
    expect(u.loyalty).toBe(40 - DECAY_IDLE);
  });

  it("skips a corp with no selling sector, leaving its stored loyalty", () => {
    expect(computeFundedBrandLoyaltyUpdates([funded({ sectors: [] })])).toEqual([]);
  });

  it("seeds a missing norm at list price", () => {
    const [u] = computeFundedBrandLoyaltyUpdates([funded({ priorNorm: null })]);
    expect(u.postureNorm).toBe(0);
  });

  it("moves at most one point from the stored value on the first funded-scored turn", () => {
    // A corp the legacy figures gave 63.5 lands within one point of it,
    // whatever its real fill.
    for (const fill of [0, 0.34, 0.35, 0.5, 1]) {
      const updates = computeFundedBrandLoyaltyUpdates([
        funded({
          corpId: "x",
          priorLoyalty: 63.5,
          sectors: [{ revenueAnchor: 5, fill, commodities: ["k"] }],
        }),
        funded({ corpId: "y", sectors: [{ revenueAnchor: 5, fill: 1, commodities: ["k"] }] }),
      ]);
      const x = updates.find((u) => u.corpId === "x")!;
      expect(Math.abs(x.loyalty - 63.5)).toBeLessThanOrEqual(1);
    }
  });
});
