import { describe, expect, it } from "vitest";
import { getSectorLaborShare } from "@/lib/labour/laborCost";
import {
  MARKET_RECOVERY_STAGE,
  normalizeMarketRecoveryStage,
  stagedLaborShare,
} from "./marketRecoveryStages";

describe("market recovery stages", () => {
  it("normalises unset, junk and out-of-range values", () => {
    expect(normalizeMarketRecoveryStage(undefined)).toBe(0);
    expect(normalizeMarketRecoveryStage("2")).toBe(0);
    expect(normalizeMarketRecoveryStage(-3)).toBe(0);
    expect(normalizeMarketRecoveryStage(1.9)).toBe(1);
    expect(normalizeMarketRecoveryStage(99)).toBe(MARKET_RECOVERY_STAGE.SERVICE_LABOUR_RELIEF);
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
});
