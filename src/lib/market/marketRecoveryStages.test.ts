import { describe, expect, it } from "vitest";
import { getSectorLaborShare } from "@/lib/labour/laborCost";
import {
  MARGIN_TRIM_STAGE2_PP,
  MARKET_RECOVERY_STAGE,
  normalizeMarketRecoveryStage,
  stagedLaborShare,
  dampedMemoryMultiplier,
  stagedMarginTrimPp,
} from "./marketRecoveryStages";

describe("market recovery stages", () => {
  it("normalises unset, junk and out-of-range values", () => {
    expect(normalizeMarketRecoveryStage(undefined)).toBe(0);
    expect(normalizeMarketRecoveryStage("2")).toBe(0);
    expect(normalizeMarketRecoveryStage(-3)).toBe(0);
    expect(normalizeMarketRecoveryStage(1.9)).toBe(1);
    expect(normalizeMarketRecoveryStage(99)).toBe(MARKET_RECOVERY_STAGE.PRICE_MEMORY_DAMP_2);
  });

  it("stage 0 changes no labour share", () => {
    for (const type of ["technology", "healthcare", "financial", "real_estate", "manufacturing"]) {
      const share = getSectorLaborShare(type, 1991);
      expect(stagedLaborShare(type, share, 0)).toBe(share);
      expect(stagedLaborShare(type, share, undefined)).toBe(share);
    }
  });

  it("stage 1 puts the four service rates halfway back and leaves others alone", () => {
    const at = (type: string) => stagedLaborShare(type, getSectorLaborShare(type, 1991), 1);
    expect(at("technology")).toBeCloseTo(0.35 * 1.1, 9);
    expect(at("healthcare")).toBeCloseTo(0.35 * 1.1, 9);
    expect(at("financial")).toBeCloseTo(0.325 * 1.1, 9);
    expect(at("real_estate")).toBeCloseTo(0.21 * 1.1, 9);
    expect(at("manufacturing")).toBe(getSectorLaborShare("manufacturing", 1991));
  });

  it("stage 2 lowers the flat margin trim; stages 0 and 1 keep it", () => {
    expect(stagedMarginTrimPp(8, 0)).toBe(8);
    expect(stagedMarginTrimPp(8, 1)).toBe(8);
    expect(stagedMarginTrimPp(8, 2)).toBe(MARGIN_TRIM_STAGE2_PP);
    expect(stagedMarginTrimPp(undefined, 2)).toBe(0);
  });

  it("stages 3 and 4 keep 75% then 50% of price-memory excess; earlier stages keep all", () => {
    expect(dampedMemoryMultiplier(1.4, 2)).toBeCloseTo(1.4, 12);
    expect(dampedMemoryMultiplier(1.4, 3)).toBeCloseTo(1.3, 12);
    expect(dampedMemoryMultiplier(1.4, 4)).toBeCloseTo(1.2, 12);
    expect(dampedMemoryMultiplier(0.8, 4)).toBeCloseTo(0.9, 12);
  });
});
