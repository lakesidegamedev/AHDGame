import { describe, expect, it } from "vitest";
import {
  demandPlanRunShare,
  LOW_USE_RUN_FLOOR,
  OUTPUT_RUN_FLOOR,
  planBaseRunShare,
  planRecoveryRunShare,
  type PriorReceipt,
} from "./outputResponseRules";
import {
  internalDelivered,
  offtakeUnits,
  ownDemandRunShare,
  withCaptiveDeliveries,
} from "./captiveDeliveryRules";

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

describe("captive value when own sites were short", () => {
  it("values own-site deliveries at captiveUnitValue when present, else at the ask", () => {
    const base = {
      activeUnits: 100,
      producedUnits: 10,
      offeredUnits: 10,
      soldUnits: 0,
      revenue: 0,
      inputsConsumed: 0,
    };
    const short = withCaptiveDeliveries({
      ...base,
      products: [{ internalDeliveredUnits: 10, askingUnitPrice: 43, captiveUnitValue: 237 }],
    });
    expect(short.soldUnits).toBe(10);
    expect(short.revenue).toBeCloseTo(2370);
    const plain = withCaptiveDeliveries({
      ...base,
      products: [{ internalDeliveredUnits: 10, askingUnitPrice: 43 }],
    });
    expect(plain.revenue).toBeCloseTo(430);
  });
});

describe("own-company demand sets the captive run", () => {
  // A mine at 1% of capacity whose whole output goes to its own sites, while
  // those sites ask for 130 units a turn and buy the rest on the market.
  const stuck = (ownSiteDemandUnits?: number) => ({
    activeUnits: 1000,
    producedUnits: 10,
    offeredUnits: 10,
    soldUnits: 0,
    revenue: 0,
    // Valued at an ask under its materials, the loss brake holds it at the floor.
    inputsConsumed: 100,
    labourPaid: 400,
    plannedRunShare: LOW_USE_RUN_FLOOR,
    products: [
      {
        commodity: "iron_ore",
        producedUnits: 10,
        internalDeliveredUnits: 10,
        askingUnitPrice: 5,
        ...(ownSiteDemandUnits != null ? { ownSiteDemandUnits } : {}),
      },
    ],
  });

  it("ramps a stuck captive site toward what its own company asked for", () => {
    const receipt = withCaptiveDeliveries(stuck(130));
    const floor = ownDemandRunShare(receipt, planBaseRunShare(receipt, LOW_USE_RUN_FLOOR));
    // Last turn's 1% plan made 10 units; 130 takes 13 times that run.
    expect(floor).toBeCloseTo(0.13);
    // The run rules alone keep it at the minimum.
    expect(planRecoveryRunShare(receipt, { floor: LOW_USE_RUN_FLOOR })).toBeCloseTo(
      LOW_USE_RUN_FLOOR
    );
  });

  it("caps the run at full capacity", () => {
    const receipt = withCaptiveDeliveries(stuck(5000));
    expect(ownDemandRunShare(receipt, planBaseRunShare(receipt, LOW_USE_RUN_FLOOR))).toBe(1);
  });

  it("leaves a site without own-company demand alone", () => {
    const receipt = withCaptiveDeliveries(stuck());
    expect(ownDemandRunShare(receipt, planBaseRunShare(receipt, LOW_USE_RUN_FLOOR))).toBe(0);
    const sold = {
      ...stuck(130),
      products: [{ ...stuck(130).products[0], internalDeliveredUnits: 0 }],
    };
    // Own sites asked but took none of its output (they buy on the market first): no pull.
    expect(ownDemandRunShare(sold, 0.01)).toBe(0);
    expect(ownDemandRunShare(null, 0.5)).toBe(0);
  });
});
