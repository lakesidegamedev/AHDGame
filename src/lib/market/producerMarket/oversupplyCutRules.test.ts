import { describe, expect, it } from "vitest";
import {
  OVERSUPPLY_MIN_SCALE,
  cashCoverShare,
  lossWithUnsoldOutput,
  oversupplyScale,
} from "./oversupplyCutRules";

describe("oversupplyScale", () => {
  it("cuts planned supply to last turn's sales times 1.05 (live turn 158 numbers)", () => {
    const scale = oversupplyScale({ lastOffered: 43843, lastSold: 26495, plannedSupply: 43843 });
    expect(scale).toBeCloseTo((26495 * 1.05) / 43843, 6);
    expect(scale * 43843).toBeGreaterThan(26495);
  });

  it("does not cut once the glut has ended", () => {
    expect(oversupplyScale({ lastOffered: 28948, lastSold: 28798, plannedSupply: 29500 })).toBe(1);
    // Unsold output, but planned supply is already within the margin.
    expect(oversupplyScale({ lastOffered: 32000, lastSold: 28000, plannedSupply: 29000 })).toBe(1);
  });

  it("does not cut a sold-out market, where demand may be higher than sales", () => {
    expect(oversupplyScale({ lastOffered: 20000, lastSold: 19900, plannedSupply: 40000 })).toBe(1);
  });

  it("never cuts deeper than the floor in one turn", () => {
    expect(oversupplyScale({ lastOffered: 100000, lastSold: 10000, plannedSupply: 100000 })).toBe(
      OVERSUPPLY_MIN_SCALE
    );
  });

  it("ignores empty or broken inputs", () => {
    expect(oversupplyScale({ lastOffered: 0, lastSold: 0, plannedSupply: 100 })).toBe(1);
    expect(oversupplyScale({ lastOffered: NaN, lastSold: 5, plannedSupply: 100 })).toBe(1);
    expect(oversupplyScale({ lastOffered: 100, lastSold: 50, plannedSupply: 0 })).toBe(1);
  });
});

describe("cashCoverShare", () => {
  it("reads a broke company as making nothing and a funded one as a full run", () => {
    expect(cashCoverShare(-937, 100, 5000)).toBe(0);
    expect(cashCoverShare(10000, 100, 5000)).toBe(1);
    expect(cashCoverShare(2600, 100, 5000)).toBeCloseTo(0.5, 6);
    expect(cashCoverShare(50, 0, 0)).toBe(1);
  });
});

describe("lossWithUnsoldOutput", () => {
  // Gangrel's Pennsylvania branch on turn 157 (anchor): half its financial services unsold.
  const glutted = {
    revenue: 86449,
    valuationCredit: 65227,
    valuationCharge: 65227,
    inputsConsumed: 75000,
    labourPaid: 26000,
    otherOperatingPaid: 1539,
    offeredUnits: 98,
    soldUnits: 39,
    products: [{ commodity: "software", internalDeliveredUnits: 35 }],
  };

  it("flags a branch that lost money and left output unsold", () => {
    expect(lossWithUnsoldOutput(glutted)).toBe(true);
  });

  it("keeps the floor for a profitable branch", () => {
    expect(lossWithUnsoldOutput({ ...glutted, revenue: 200000 })).toBe(false);
  });

  it("keeps the floor for a plant whose output all went to buyers or its own sites", () => {
    // A mine feeding its own steel plant at a loss: nothing unsold.
    expect(
      lossWithUnsoldOutput({
        revenue: 0,
        valuationCredit: 500,
        inputsConsumed: 900,
        offeredUnits: 10,
        soldUnits: 0,
        products: [{ commodity: "iron_ore", internalDeliveredUnits: 10 }],
      })
    ).toBe(false);
  });

  it("does not count cold upkeep on idle capacity as a running loss", () => {
    expect(
      lossWithUnsoldOutput({
        revenue: 1000,
        inputsConsumed: 800,
        otherOperatingPaid: 500,
        idleOperatingCost: 400,
        offeredUnits: 10,
        soldUnits: 5,
      })
    ).toBe(false);
  });

  it("is false without a receipt", () => {
    expect(lossWithUnsoldOutput(null)).toBe(false);
  });
});
