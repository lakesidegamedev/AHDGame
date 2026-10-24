import { describe, expect, it } from "vitest";
import { demandPlanRunShare, OUTPUT_RUN_FLOOR, type PriorReceipt } from "./outputResponseRules";
import { internalDelivered, offtakeUnits, withCaptiveDeliveries } from "./captiveDeliveryRules";

const captive = (): PriorReceipt & {
  products: { internalDeliveredUnits: number; askingUnitPrice: number }[];
} => ({
  activeUnits: 100,
  producedUnits: 50,
  offeredUnits: 50,
  soldUnits: 0,
  revenue: 0,
  inputsConsumed: 100,
  labourPaid: 50,
  products: [{ internalDeliveredUnits: 50, askingUnitPrice: 5 }],
});

describe("captive deliveries", () => {
  it("counts units delivered to the company's own sites as offtake", () => {
    expect(internalDelivered(captive().products)).toBe(50);
    expect(offtakeUnits(captive())).toBe(50);
    expect(offtakeUnits({ soldUnits: 3 })).toBe(3);
  });

  it("values internal deliveries at the plant's ask and leaves a selling receipt alone", () => {
    const r = withCaptiveDeliveries(captive());
    expect(r.soldUnits).toBe(50);
    expect(r.revenue).toBe(250);
    const plain = { ...captive(), products: [] };
    expect(withCaptiveDeliveries(plain)).toBe(plain);
  });

  it("keeps a profitable captive supplier on its run instead of the probe floor", () => {
    expect(demandPlanRunShare(captive())).toBe(OUTPUT_RUN_FLOOR);
    expect(demandPlanRunShare(withCaptiveDeliveries(captive()))).toBeGreaterThan(0.5);
  });
});
