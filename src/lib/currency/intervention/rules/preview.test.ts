import { describe, it, expect } from "vitest";
import { previewDefence, stabilizationBand, type DefencePreviewContext } from "./preview";
const context: DefencePreviewContext = {
  rawRate: 0.85,
  organicPressure: 0,
  hardFloor: 0.5,
  hardCeiling: 1.5,
  homeRate: 0.85,
  marketDepthAnchor: 20_000_000,
  adherence: 1,
  buyReservesAnchor: 100000,
  sellReservesAnchor: 200000,
  macroTarget: 0.948,
  driftAlpha: 0.075,
};
describe("conditional FX previews", () => {
  it("warns about an unsustainable distant commitment", () =>
    expect(previewDefence(context, { floor: 0.5, ceiling: 0.51 })!.fundamentalWarning).toBe(true));
  it("offers a nearby band without promising a permanent target", () => {
    const p = stabilizationBand(context, "current");
    expect(p.floor).toBeCloseTo(0.833);
    expect(p.ceiling).toBeCloseTo(0.867);
    expect(previewDefence(context, p)!.spendAnchor).toBe(0);
  });
  it("gates unavailable direction-specific reserves", () => {
    const p = previewDefence({ ...context, buyReservesAnchor: 0 }, { floor: 0.7, ceiling: 0.8 })!;
    expect(p.exhausted).toBe(true);
    expect(p.spendHome).toBe(0);
  });
  it("keeps suggested bands inside legal policy bounds even with wider float guardrails", () => {
    const wide = {
      ...context,
      rawRate: 1.7,
      hardCeiling: 1.75,
      policyFloor: 0.5,
      policyCeiling: 1.5,
    };
    const p = stabilizationBand(wide, "current");
    expect(p.floor).toBeLessThan(p.ceiling);
    expect(p.ceiling).toBe(1.5);
    expect(p.floor).toBeGreaterThanOrEqual(0.5);
  });
});
