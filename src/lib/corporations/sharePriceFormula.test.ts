import { describe, it, expect } from "vitest";
import {
  annualizedTrailingGrowthRate,
  clampSplitCooldownPrevAnchor,
  computeSharePrices,
  insiderConcentrationMultiplier,
  subsidiarySprawlMultiplier,
  type SharePriceInput,
} from "./sharePriceFormula";
import {
  SHARE_PRICE_MAX_TURN_MOVE,
  STOCK_SPLIT_PREV_ANCHOR_MAX_RATIO,
  STOCK_SPLIT_SMOOTHING_PREV_WEIGHT,
} from "@/lib/constants/corporations";

/**
 * A minimal input: zero-asset corp so the price is the earnings component
 * alone, making penalty and clamping effects directly visible.
 */
const base: SharePriceInput = {
  corpId: "corp",
  liquidCapitalAnchor: 0,
  sectorNPVAnchor: 0,
  issuedBondDebt: 0,
  bondHoldingsAnchor: 0,
  normalizedEarningsAnchor: 480_000,
  bondCouponEarningsAnchor: 0,
  sectorGrowthRate: 0,
  costOfCapital: 0.08,
  totalShares: 100_000,
  ceoOwnershipFraction: 0,
  indexFundOwnershipFraction: 0,
  isPrivate: true,
  // At or below SHARE_PRICE_RATE_LIMIT_MIN_PREV the per-turn rate limiter is
  // bypassed, so assertions see the raw fundamental rather than a clamp.
  previousSharePrice: 1,
  imfBailoutActive: false,
  lastShareStructureTurn: null,
};

const price = (over: Partial<SharePriceInput>) =>
  computeSharePrices([{ ...base, ...over, corpId: "corp" }], 100).get("corp")!;

describe("bond reliance uses NET bond income (corp 484 misfire)", () => {
  it("a net debtor is priced identically to a corp with no bond exposure", () => {
    // Corp 484's shape: coupons received but MORE interest paid. Gross-coupon
    // reliance clamped its operating earnings to 0 and halved the rest; net
    // basis must leave the price exactly where a bond-free operator sits.
    const noBonds = price({});
    const netDebtor = price({
      bondCouponEarningsAnchor: 371_000,
      bondInterestExpenseAnchor: 763_000,
    });
    expect(netDebtor).toBe(noBonds);
  });

  it("a pure coupon-fund is still discounted and penalized", () => {
    // No issuer interest: the original #941 case keeps its full treatment.
    const fund = price({ bondCouponEarningsAnchor: 480_000 });
    const noBonds = price({});
    expect(fund).toBeLessThan(noBonds);
  });

  it("only the net coupon slice is treated as bond income", () => {
    // 300K coupons vs 100K interest: 200K of the 480K earnings is bond-derived.
    // Price must sit strictly between the pure-operator and pure-fund cases.
    const mixed = price({
      bondCouponEarningsAnchor: 300_000,
      bondInterestExpenseAnchor: 100_000,
    });
    expect(mixed).toBeGreaterThan(price({ bondCouponEarningsAnchor: 480_000 }));
    expect(mixed).toBeLessThanOrEqual(price({}));
  });

  it("absent interest field preserves prior behaviour exactly", () => {
    const withField = price({ bondCouponEarningsAnchor: 480_000, bondInterestExpenseAnchor: 0 });
    const withoutField = price({ bondCouponEarningsAnchor: 480_000 });
    expect(withField).toBe(withoutField);
  });
});

describe("split-cooldown previous-price anchor clamp (2026-08-20 incident)", () => {
  it("clampSplitCooldownPrevAnchor bounds prev to K x fundamental both ways", () => {
    expect(clampSplitCooldownPrevAnchor(3403, 12)).toBe(12 * STOCK_SPLIT_PREV_ANCHOR_MAX_RATIO);
    expect(clampSplitCooldownPrevAnchor(1, 12)).toBe(12 / STOCK_SPLIT_PREV_ANCHOR_MAX_RATIO);
    expect(clampSplitCooldownPrevAnchor(20, 12)).toBe(20);
  });

  it("passes prev through when fundamental is non-positive or non-finite", () => {
    expect(clampSplitCooldownPrevAnchor(50, 0)).toBe(50);
    expect(clampSplitCooldownPrevAnchor(50, -3)).toBe(50);
    expect(clampSplitCooldownPrevAnchor(50, Number.NaN)).toBe(50);
  });

  it("a poisoned live price cannot dominate the cooldown blend", () => {
    // In cooldown with an honest prev the blend tracks prev closely; with a
    // wildly pumped prev (the incident shape: live ~250x fundamentals) the
    // result must be capped by the K-ratio anchor, not scale with prev.
    const honest = price({ lastShareStructureTurn: 100, previousSharePrice: 60 });
    const pumped = price({ lastShareStructureTurn: 100, previousSharePrice: 15_000 });
    const veryPumped = price({ lastShareStructureTurn: 100, previousSharePrice: 150_000 });
    // Clamp binds: further pumping the prev changes nothing.
    expect(pumped).toBe(veryPumped);
    // And the capped result stays within K x the honest-prev blend ballpark.
    expect(pumped).toBeLessThanOrEqual(honest * STOCK_SPLIT_PREV_ANCHOR_MAX_RATIO);
  });

  it("an honest split-scaled prev is unaffected by the clamp", () => {
    // Post-split, prev and fundamental are rescaled by the same share-count
    // ratio, so prev/fundamental stays near 1 and the clamp must be inert.
    const inCooldown = price({ lastShareStructureTurn: 100, previousSharePrice: 55 });
    const W = STOCK_SPLIT_SMOOTHING_PREV_WEIGHT;
    // fundamentalValue for the base fixture (earnings-only corp).
    const fundamental = price({ previousSharePrice: 1 });
    const expected = Math.round((W * 55 + (1 - W) * fundamental) * 100) / 100;
    expect(inCooldown).toBeCloseTo(expected, 2);
  });
});

describe("annualizedTrailingGrowthRate — plants growth-premium input", () => {
  const TPY = 48;

  it("annualizes geometric growth from the oldest usable prior", () => {
    // 100 -> 121 over 2 turns = 10%/turn -> 4.8/yr.
    const g = annualizedTrailingGrowthRate(
      121,
      [
        { turn: 98, sectorNpv: 100 },
        { turn: 99, sectorNpv: 110 },
      ],
      100,
      TPY
    );
    expect(g).toBeCloseTo(0.1 * TPY, 10);
  });

  it("returns 0 for flat, shrinking, or history-less corps (premium neutral)", () => {
    expect(annualizedTrailingGrowthRate(100, [{ turn: 99, sectorNpv: 100 }], 100, TPY)).toBe(0);
    expect(annualizedTrailingGrowthRate(90, [{ turn: 99, sectorNpv: 100 }], 100, TPY)).toBe(0);
    expect(annualizedTrailingGrowthRate(100, [], 100, TPY)).toBe(0);
  });

  it("fail-closes on non-positive or non-finite inputs", () => {
    expect(annualizedTrailingGrowthRate(0, [{ turn: 99, sectorNpv: 100 }], 100, TPY)).toBe(0);
    expect(annualizedTrailingGrowthRate(-5, [{ turn: 99, sectorNpv: 100 }], 100, TPY)).toBe(0);
    expect(annualizedTrailingGrowthRate(120, [{ turn: 99, sectorNpv: 0 }], 100, TPY)).toBe(0);
    expect(annualizedTrailingGrowthRate(120, [{ turn: 99, sectorNpv: -40 }], 100, TPY)).toBe(0);
    expect(annualizedTrailingGrowthRate(120, [{ turn: 100, sectorNpv: 100 }], 100, TPY)).toBe(0);
    expect(annualizedTrailingGrowthRate(Number.NaN, [{ turn: 99, sectorNpv: 100 }], 100, TPY)).toBe(
      0
    );
  });

  it("a growing corp earns a premium over an identical flat corp", () => {
    const flat = price({ sectorGrowthRate: 0 });
    const growing = price({
      sectorGrowthRate: annualizedTrailingGrowthRate(121, [{ turn: 98, sectorNpv: 100 }], 100, TPY),
    });
    expect(growing).toBeGreaterThan(flat);
  });
});

describe("subsidiary sprawl discount (suggestion #363)", () => {
  it("is free up to 3 subsidiaries, ramps linearly, caps at -50% from 9", () => {
    expect(subsidiarySprawlMultiplier(0)).toBe(1);
    expect(subsidiarySprawlMultiplier(3)).toBe(1);
    expect(subsidiarySprawlMultiplier(4)).toBeCloseTo(1 - 0.5 / 6);
    expect(subsidiarySprawlMultiplier(6)).toBeCloseTo(0.75);
    expect(subsidiarySprawlMultiplier(9)).toBeCloseTo(0.5);
    expect(subsidiarySprawlMultiplier(20)).toBeCloseTo(0.5);
  });

  it("discounts the fundamental, not the smoothed price, so it does not compound", () => {
    const undiscounted = price({});
    expect(price({ subsidiaryCount: 9 })).toBeCloseTo(undiscounted * 0.5, 1);
    // Rate-limited path seeded at the discounted price stays put turn over turn.
    const settled = price({ subsidiaryCount: 9, previousSharePrice: undiscounted * 0.5 });
    expect(settled).toBeCloseTo(undiscounted * 0.5, 1);
  });
});

describe("rate limiter works in the post-multiplier price space", () => {
  // Public corp, CEO holds 9,993,397 of 10,000,000 shares. M = the
  // insider-concentration multiplier (~0.7011) is below 1/1.35, so multiplying
  // AFTER the limiter made the persisted price decay by 1.35 x M (~0.9465) every
  // turn while the raw fundamental stayed far above it: the up-ceiling bound
  // every turn, and the price only "rescued" itself by decaying to the ₳1.00
  // limiter floor and snapping back to M x fundamental in one turn.
  const CEO_OWNERSHIP = 0.9993397;
  const M = insiderConcentrationMultiplier(CEO_OWNERSHIP, false);
  const shared: Partial<SharePriceInput> = {
    isPrivate: false,
    ceoOwnershipFraction: CEO_OWNERSHIP,
    indexFundOwnershipFraction: 0,
    totalShares: 10_000_000,
    sectorNPVAnchor: 1_000_000_000_000,
  };

  it("M sits inside the decay band the bug required", () => {
    expect(M).toBeLessThan(1 / (1 + SHARE_PRICE_MAX_TURN_MOVE));
  });

  it("converges up to the discounted fundamental instead of decaying", () => {
    // prev <= ₳1.00 bypasses the limiter, so this is M x fundamental.
    const target = price({ ...shared, previousSharePrice: 1 });
    const start = 4930;
    // The reported shape: raw fundamental at least 10x the prior price.
    expect(target / M).toBeGreaterThanOrEqual(10 * start);

    const prices: number[] = [];
    let prev = start;
    for (let n = 0; n < 25; n++) {
      prev = price({ ...shared, previousSharePrice: prev });
      prices.push(prev);
    }
    const reference = (n: number) => (n === 0 ? start : prices[n - 1]);

    // The limiter bounds each step against the persisted prior itself: at most
    // +35% per turn. (Under the old ordering the step was 1.35 * M because the
    // two sides of that comparison were on different scales, which is the bug.)
    const maxStep = start * (1 + SHARE_PRICE_MAX_TURN_MOVE);
    expect(prices[0]).toBeLessThanOrEqual(maxStep + 0.01);
    expect(prices[0]).toBeGreaterThanOrEqual(start * (1 - SHARE_PRICE_MAX_TURN_MOVE) - 0.01);
    // Every turn moves toward the discounted fundamental; none moves away.
    for (let n = 0; n < prices.length; n++) {
      expect(prices[n]).toBeGreaterThanOrEqual(reference(n) - 0.01);
      expect(prices[n]).toBeLessThanOrEqual(reference(n) * (1 + SHARE_PRICE_MAX_TURN_MOVE) + 0.01);
      expect(prices[n]).toBeLessThanOrEqual(target * 1.001);
    }
    // Converged, then held: from the first turn inside 1% it never falls back.
    const settled = prices.findIndex((p) => p >= 0.99 * target);
    expect(settled).toBeGreaterThanOrEqual(0);
    for (let n = settled; n < prices.length; n++) {
      expect(prices[n]).toBeGreaterThanOrEqual(0.99 * target);
    }
  });

  it("is unchanged when the concentration multiplier is 1", () => {
    // M = 1 and no index premium: the price is the plain +35% limiter step.
    expect(price({ ...shared, ceoOwnershipFraction: 0, previousSharePrice: 4930 })).toBe(
      4930 * (1 + SHARE_PRICE_MAX_TURN_MOVE)
    );
  });
});
