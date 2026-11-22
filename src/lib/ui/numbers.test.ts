import { describe, expect, it } from "vitest";
import {
  formatCount,
  formatCountDelta,
  formatMoney,
  formatMoneyDelta,
  formatPercent,
  formatPercentDelta,
  formatPercentagePoints,
  formatPerTurn,
  formatShares,
  formatTurns,
} from "./numbers";
import { toneForDelta, toneForLimit, toneText } from "./tone";

describe("numbers", () => {
  it("formats money with cents only when asked", () => {
    expect(formatMoney(1234.5)).toBe("$1,235");
    expect(formatMoney(1234.5, { cents: true })).toBe("$1,234.50");
    expect(formatMoney(-1234, { symbol: "£" })).toBe("-£1,234");
    expect(formatMoney(2_500_000, { compact: true })).toBe("$2.5M");
  });
  it("always signs deltas and never signs zero", () => {
    expect(formatMoneyDelta(50)).toBe("+$50");
    expect(formatMoneyDelta(-50)).toBe("-$50");
    expect(formatMoneyDelta(0)).toBe("$0");
    expect(formatMoneyDelta(0.2)).toBe("$0");
    expect(formatPercentDelta(1.25)).toBe("+1.3%");
    expect(formatPercentDelta(-0.04)).toBe("0.0%");
    expect(formatPercentDelta(0)).toBe("0.0%");
    expect(formatCountDelta(-1200)).toBe("-1,200");
  });
  it("keeps percent and percentage points apart", () => {
    expect(formatPercent(12.34)).toBe("12.3%");
    expect(formatPercentagePoints(-2)).toBe("-2.0 pp");
  });
  it("formats counts, shares and durations", () => {
    expect(formatCount(1234567)).toBe("1,234,567");
    expect(formatShares(10.5)).toBe("10.5");
    expect(formatPerTurn("+$5")).toBe("+$5/turn");
    expect(formatTurns(1)).toBe("1 turn");
    expect(formatTurns(24)).toBe("24 turns");
  });
  it("renders unusable input as a placeholder", () => {
    expect(formatMoney(NaN)).toBe("$—");
    expect(formatPercent(Infinity)).toBe("—");
  });
});

describe("tone", () => {
  it("never colours zero or unusable values", () => {
    expect(toneForDelta(0)).toBe("neutral");
    expect(toneForDelta(NaN)).toBe("neutral");
    expect(toneForDelta(null)).toBe("neutral");
  });
  it("maps sign to gain or loss, with invert for costs", () => {
    expect(toneForDelta(3)).toBe("gain");
    expect(toneForDelta(-3)).toBe("loss");
    expect(toneForDelta(3, true)).toBe("loss");
  });
  it("maps limits", () => {
    expect(toneForLimit(10, 100)).toBe("neutral");
    expect(toneForLimit(90, 100)).toBe("warning");
    expect(toneForLimit(100, 100)).toBe("over-limit");
  });
  it("keeps the action tone off the loss colour class", () => {
    expect(toneText("action")).not.toBe(toneText("loss"));
  });
});
