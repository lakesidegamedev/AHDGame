import { describe, expect, it } from "vitest";
import {
  CEO_MAX_LEVEL,
  CEO_OVERHEAD_DISCOUNT_CAP_PP,
  CEO_OVERHEAD_DISCOUNT_PER_LEVEL,
  CEO_PAY_REVIEW_TURNS,
  CEO_PROFIT_SHARE_CAP,
  ceoBaseSalary,
  ceoLevel,
  ceoOverheadDiscountPp,
  ceoPayDemand,
  counterAccepted,
  defaultPayAction,
  nextPayReviewTurn,
} from "./nppCeoCareer";

describe("CEO constants", () => {
  it("keeps the level range at one to ten", () => {
    expect(CEO_MAX_LEVEL).toBe(10);
    expect(CEO_MAX_LEVEL).toBeGreaterThan(1);
  });

  it("reviews pay every twenty four turns and caps the profit share at ten percent", () => {
    expect(CEO_PAY_REVIEW_TURNS).toBe(24);
    expect(CEO_PROFIT_SHARE_CAP).toBe(0.10);
    expect(CEO_PROFIT_SHARE_CAP).toBeGreaterThan(0);
    expect(CEO_PROFIT_SHARE_CAP).toBeLessThan(1);
  });

  it("discounts overhead by ten percent per level up to two margin points", () => {
    expect(CEO_OVERHEAD_DISCOUNT_PER_LEVEL).toBe(0.10);
    expect(CEO_OVERHEAD_DISCOUNT_CAP_PP).toBe(2);
    expect(CEO_OVERHEAD_DISCOUNT_CAP_PP).toBeGreaterThan(0);
  });
});

describe("ceoLevel", () => {
  it("returns level one for a missing record or a record with no turns", () => {
    expect(ceoLevel(undefined)).toBe(1);
    expect(ceoLevel({ turns: 0, relMarginPp: 0 })).toBe(1);
    expect(ceoLevel({ turns: 0, relMarginPp: 10 })).toBe(1);
    expect(ceoLevel({ turns: -12, relMarginPp: 10 })).toBe(1);
    expect(ceoLevel({ turns: Number.NaN, relMarginPp: 5 })).toBe(1);
  });

  it("grows with turns served", () => {
    expect(ceoLevel({ turns: 48, relMarginPp: 0 })).toBe(2);
    expect(ceoLevel({ turns: 240, relMarginPp: 0 })).toBe(4);
    expect(ceoLevel({ turns: 480, relMarginPp: 0 })).toBe(7);
  });

  it("rewards margin against peers and punishes poor margins", () => {
    expect(ceoLevel({ turns: 240, relMarginPp: 10 })).toBe(8);
    expect(ceoLevel({ turns: 240, relMarginPp: -10 })).toBe(1);
    expect(ceoLevel({ turns: 240, relMarginPp: Number.NaN })).toBe(4);
  });

  it("caps at level ten and treats extreme records as bounded", () => {
    expect(ceoLevel({ turns: 480, relMarginPp: 10 })).toBe(10);
    expect(ceoLevel({ turns: 100_000, relMarginPp: 10 })).toBe(10);
    expect(ceoLevel({ turns: 5_000, relMarginPp: -1_000 })).toBe(3);
    expect(ceoLevel({ turns: 480, relMarginPp: Number.POSITIVE_INFINITY })).toBe(7);
  });
});

describe("ceoOverheadDiscountPp", () => {
  it("gives no discount at level one", () => {
    expect(ceoOverheadDiscountPp(1, 10)).toBe(0);
    expect(ceoOverheadDiscountPp(0, 10)).toBe(0);
    expect(ceoOverheadDiscountPp(Number.NaN, 10)).toBe(0);
  });

  it("scales the discount with level", () => {
    expect(ceoOverheadDiscountPp(2, 0.5)).toBeCloseTo(0.05, 10);
    expect(ceoOverheadDiscountPp(5, 1)).toBeCloseTo(0.4, 10);
    expect(ceoOverheadDiscountPp(5, 1)).toBeGreaterThan(ceoOverheadDiscountPp(2, 0.5));
  });

  it("caps the discount in margin points", () => {
    expect(ceoOverheadDiscountPp(10, 100)).toBe(CEO_OVERHEAD_DISCOUNT_CAP_PP);
    expect(ceoOverheadDiscountPp(3, 10)).toBe(CEO_OVERHEAD_DISCOUNT_CAP_PP);
    expect(ceoOverheadDiscountPp(20, 10)).toBe(CEO_OVERHEAD_DISCOUNT_CAP_PP);
  });

  it("never removes more overhead than the corporation pays", () => {
    expect(ceoOverheadDiscountPp(10, 0.5)).toBeCloseTo(0.45, 10);
    expect(ceoOverheadDiscountPp(10, 0.5)).toBeLessThanOrEqual(0.5);
    expect(ceoOverheadDiscountPp(5, 0)).toBe(0);
    expect(ceoOverheadDiscountPp(5, -3)).toBe(0);
    expect(ceoOverheadDiscountPp(5, Number.NaN)).toBe(0);
    expect(ceoOverheadDiscountPp(5, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("ceoBaseSalary", () => {
  it("pays half a salary unit at level one and a quarter more per level", () => {
    expect(ceoBaseSalary(1, 100)).toBe(50);
    expect(ceoBaseSalary(2, 100)).toBeCloseTo(75, 10);
    expect(ceoBaseSalary(5, 200)).toBeCloseTo(300, 10);
  });

  it("reaches the level ten ceiling and clamps out of range levels", () => {
    expect(ceoBaseSalary(10, 100)).toBeCloseTo(275, 10);
    expect(ceoBaseSalary(99, 100)).toBeCloseTo(275, 10);
    expect(ceoBaseSalary(0, 100)).toBe(50);
    expect(ceoBaseSalary(-4, 100)).toBe(50);
    expect(ceoBaseSalary(Number.NaN, 100)).toBe(50);
  });

  it("returns zero when the era salary unit is unusable", () => {
    expect(ceoBaseSalary(5, 0)).toBe(0);
    expect(ceoBaseSalary(5, -100)).toBe(0);
    expect(ceoBaseSalary(5, Number.NaN)).toBe(0);
    expect(ceoBaseSalary(5, Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("ceoPayDemand", () => {
  it("asks for the base salary when there is no profit", () => {
    const demand = ceoPayDemand({
      level: 5,
      trailingProfit: -1_000,
      plantCount: 300,
      growthRate: 0,
      ambition: 50,
      loyalty: 50,
      eraSalaryUnit: 100,
      currentSalary: 100,
    });
    expect(demand).toBe(150);
  });

  it("adds the profit share on top of the base salary", () => {
    const demand = ceoPayDemand({
      level: 10,
      trailingProfit: 1_000,
      plantCount: 300,
      growthRate: 0,
      ambition: 50,
      loyalty: 50,
      eraSalaryUnit: 100,
      currentSalary: 0,
    });
    expect(demand).toBe(315);
  });

  it("rounds to whole units", () => {
    const demand = ceoPayDemand({
      level: 5,
      trailingProfit: 333,
      plantCount: 300,
      growthRate: 0,
      ambition: 50,
      loyalty: 50,
      eraSalaryUnit: 100,
      currentSalary: 0,
    });
    expect(demand).toBe(157);
    expect(Number.isInteger(demand)).toBe(true);
  });

  it("caps the profit share for huge plants, strong growth and extreme temperament", () => {
    const demand = ceoPayDemand({
      level: 10,
      trailingProfit: 1_000_000,
      plantCount: 1_000_000,
      growthRate: 5,
      ambition: 100,
      loyalty: 0,
      eraSalaryUnit: 100,
      currentSalary: 0,
    });
    expect(demand).toBe(100_275);
    expect(demand).toBeLessThanOrEqual(275 + CEO_PROFIT_SHARE_CAP * 1_000_000);
  });

  it("clamps tiny plants, negative growth and low ambition into their floors", () => {
    const demand = ceoPayDemand({
      level: 10,
      trailingProfit: 100_000,
      plantCount: 1,
      growthRate: -0.9,
      ambition: 0,
      loyalty: 100,
      eraSalaryUnit: 100,
      currentSalary: 0,
    });
    const share = 0.04 * 1 * 0.25 * 0.75 * 0.5;
    expect(share).toBeLessThan(CEO_PROFIT_SHARE_CAP);
    expect(demand).toBe(Math.round(275 + share * 100_000));
  });

  it("never exceeds the base plus the profit share cap when the current salary is high", () => {
    const demand = ceoPayDemand({
      level: 1,
      trailingProfit: 100,
      plantCount: 300,
      growthRate: 0,
      ambition: 50,
      loyalty: 50,
      eraSalaryUnit: 100,
      currentSalary: 500,
    });
    expect(demand).toBe(60);
    expect(demand).toBeLessThanOrEqual(50 + CEO_PROFIT_SHARE_CAP * 100);
  });

  it("never goes negative and survives non-finite inputs", () => {
    const demand = ceoPayDemand({
      level: Number.NaN,
      trailingProfit: -5,
      plantCount: Number.NaN,
      growthRate: Number.NaN,
      ambition: Number.NaN,
      loyalty: Number.NaN,
      eraSalaryUnit: 100,
      currentSalary: Number.NaN,
    });
    expect(demand).toBe(50);
    const zero = ceoPayDemand({
      level: Number.NaN,
      trailingProfit: Number.NaN,
      plantCount: Number.NaN,
      growthRate: Number.NaN,
      ambition: Number.NaN,
      loyalty: Number.NaN,
      eraSalaryUnit: Number.NaN,
      currentSalary: Number.NaN,
    });
    expect(zero).toBe(0);
  });
});

describe("counterAccepted", () => {
  it("accepts a reasonable cut from a mild CEO", () => {
    expect(counterAccepted(100, 80, 0)).toBe(true);
    expect(counterAccepted(100, 75, 0)).toBe(true);
    expect(counterAccepted(100, 74, 0)).toBe(false);
  });

  it("makes stubborn CEOs hold out for more", () => {
    expect(counterAccepted(100, 80, 100)).toBe(false);
    expect(counterAccepted(100, 100, 100)).toBe(true);
    expect(counterAccepted(100, 99, 400)).toBe(false);
  });

  it("clamps stubbornness and rejects nonsense numbers", () => {
    expect(counterAccepted(100, 75, -1_000)).toBe(true);
    expect(counterAccepted(100, 74, -1_000)).toBe(false);
    expect(counterAccepted(100, 80, Number.NaN)).toBe(true);
    expect(counterAccepted(Number.NaN, 80, 50)).toBe(false);
    expect(counterAccepted(100, Number.NaN, 50)).toBe(false);
  });

  it("accepts a zero counter for a zero demand", () => {
    expect(counterAccepted(0, 0, 100)).toBe(true);
    expect(counterAccepted(0, -1, 100)).toBe(false);
  });
});

describe("defaultPayAction", () => {
  it("accepts a demand inside the configured profit share", () => {
    expect(defaultPayAction(30, 1_000, 0.03)).toBe("accept");
    expect(defaultPayAction(30, 1_000, 0.031)).toBe("accept");
    expect(defaultPayAction(31, 1_000, 0.03)).toBe("replace");
  });

  it("replaces when there is no profit to share", () => {
    expect(defaultPayAction(10, -100, 0.03)).toBe("replace");
    expect(defaultPayAction(10, 0, 0.03)).toBe("replace");
    expect(defaultPayAction(10, 1_000, 0)).toBe("replace");
  });

  it("always accepts a demand of zero and rejects impossible numbers", () => {
    expect(defaultPayAction(0, 0, 0)).toBe("accept");
    expect(defaultPayAction(-5, -100, 0.03)).toBe("accept");
    expect(defaultPayAction(Number.NaN, 1_000, 0.03)).toBe("replace");
    expect(defaultPayAction(10, 1_000, Number.NaN)).toBe("replace");
  });
});

describe("nextPayReviewTurn", () => {
  it("starts one review period after appointment", () => {
    expect(nextPayReviewTurn(0, 0, 0)).toBe(24);
    expect(nextPayReviewTurn(100, 100, 0)).toBe(124);
    expect(nextPayReviewTurn(100, 123, 0)).toBe(124);
  });

  it("moves to the following review when the current turn is a review turn", () => {
    expect(nextPayReviewTurn(0, 24, 0)).toBe(48);
    expect(nextPayReviewTurn(0, 48, 0)).toBe(72);
    expect(nextPayReviewTurn(0, 1_000, 0)).toBe(1_008);
  });

  it("honours the earliest allowed turn", () => {
    expect(nextPayReviewTurn(0, 0, 100)).toBe(120);
    expect(nextPayReviewTurn(0, 0, 48)).toBe(48);
    expect(nextPayReviewTurn(0, 0, 49)).toBe(72);
    expect(nextPayReviewTurn(0, 0, -50)).toBe(24);
  });

  it("stays sane on non-finite inputs", () => {
    expect(nextPayReviewTurn(Number.NaN, Number.NaN, Number.NaN)).toBe(24);
    expect(nextPayReviewTurn(0, Number.POSITIVE_INFINITY, 0)).toBe(24);
    expect(nextPayReviewTurn(Number.POSITIVE_INFINITY, 0, 0)).toBe(24);
  });
});
