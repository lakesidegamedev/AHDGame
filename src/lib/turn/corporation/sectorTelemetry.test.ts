import { describe, expect, it } from "vitest";
import { clearingFillMeasured, marketTelemetry } from "./sectorTelemetry";

describe("market telemetry turn identity", () => {
  it("stamps the turn of the persisted sold fractions", () => {
    const telemetry = marketTelemetry({
      clearingEnabled: true,
      clearing: {
        factor: 0.75,
        soldFraction: 0.75,
        soldByCommodity: { advertising: 0.5 },
        deliveredUnitsByCommodity: { advertising: 123.456789 },
        effectivePosture: 0,
      },
      clearingFactor: 0.75,
      currentTurn: 24,
      mothballed: false,
      sector: { lowFillTurns: 0 },
    });

    expect(telemetry).toMatchObject({
      soldByCommodity: { advertising: 0.5 },
      soldByCommodityTurn: 24,
      soldUnitsByCommodity: { advertising: 123.456789 },
      soldUnitsByCommodityTurn: 24,
    });
  });
});

it("does not write a delivery witness while recording is off", () => {
  expect(
    marketTelemetry({
      clearingEnabled: true,
      clearing: {
        factor: 1,
        soldFraction: 1,
        soldByCommodity: { advertising: 1 },
        effectivePosture: 0,
      },
      clearingFactor: 1,
      currentTurn: 24,
      mothballed: false,
      sector: {},
    })
  ).not.toHaveProperty("soldUnitsByCommodity");
});

describe("first producing turn after a reset", () => {
  const zeroFill = {
    factor: 1,
    soldFraction: 0,
    soldByCommodity: { food: 0 },
    deliveredUnitsByCommodity: { food: 0 },
    effectivePosture: 0.05,
  };

  it("does not record a zero fill that had no demand book to clear against", () => {
    const telemetry = marketTelemetry({
      clearingEnabled: true,
      clearing: { ...zeroFill, fillMeasured: false },
      clearingFactor: 1,
      currentTurn: 2,
      clearingStartTurn: 2,
      mothballed: false,
      sector: { lowFillTurns: 0 },
    });
    expect(telemetry).not.toHaveProperty("soldFraction");
    expect(telemetry).not.toHaveProperty("lowFillTurns");
    expect(telemetry).not.toHaveProperty("soldByCommodity");
    expect(telemetry).not.toHaveProperty("soldUnitsByCommodity");
    // The ramp anchor and posture still advance, so turn 3 clears normally.
    expect(telemetry).toMatchObject({
      clearingFactor: 1,
      clearingStartTurn: 2,
      effectivePosture: 0.05,
    });
  });

  it("still records a measured zero fill", () => {
    const telemetry = marketTelemetry({
      clearingEnabled: true,
      clearing: zeroFill,
      clearingFactor: 1,
      currentTurn: 9,
      mothballed: false,
      sector: { lowFillTurns: 2 },
    });
    expect(telemetry).toMatchObject({ soldFraction: 0, lowFillTurns: 3 });
  });

  it("counts a fill as measured when any output had a prior-turn book", () => {
    const clearing = { soldByCommodity: { food: 0, beverages: 0 } };
    expect(clearingFillMeasured(clearing, new Set())).toBe(false);
    expect(clearingFillMeasured(clearing, new Set(["beverages"]))).toBe(true);
    expect(clearingFillMeasured(clearing, undefined)).toBe(true);
    expect(clearingFillMeasured(undefined, new Set())).toBe(true);
    expect(clearingFillMeasured({ soldByCommodity: {} }, new Set())).toBe(true);
  });
});
