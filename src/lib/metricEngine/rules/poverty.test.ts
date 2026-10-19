import { describe, expect, it } from "vitest";
import { evalNode } from "../coexistence";
import { povertyRateNode } from "../registry/economic";
import {
  povertyDeliveredPressure,
  povertyLawRelief,
  povertyTarget,
  type PovertyProgram,
} from "./poverty";

const program: PovertyProgram = {
  _id: "law",
  country: "UK",
  scope: "national",
  familyId: "L01",
  fundingAccountId: "account",
  effectiveTurn: 2,
  primaryMetricEffects: [{ metricId: "03", favorableNormalizedPoints: 0.72 }],
};

describe("poverty rules", () => {
  it("uses actual delivery, without treating normalized points as percentage points", () => {
    const pressure = (factor: number) =>
      povertyDeliveredPressure(
        [program],
        new Map([["law", { implementationFactor: factor, lastSettledTurn: 10 }]]),
        10
      );
    expect(pressure(0)).toBe(0);
    expect(pressure(0.5)).toBeCloseTo(0.36);
    expect(pressure(1)).toBeCloseTo(0.72);
    expect(povertyLawRelief(pressure(1))).not.toBe(0.72);
  });

  it("does not borrow funding from before enactment, the future, or expired settlements", () => {
    for (const paid of [
      { implementationFactor: 1, lastSettledTurn: 1, validThroughTurn: 20 },
      { implementationFactor: 1, lastSettledTurn: 11 },
      { implementationFactor: 1, lastSettledTurn: 8, validThroughTurn: 9 },
      { implementationFactor: 1, lastSettledTurn: NaN },
      { implementationFactor: 1, lastSettledTurn: 10, validThroughTurn: NaN },
    ])
      expect(povertyDeliveredPressure([program], new Map([["law", paid]]), 10)).toBe(0);
    expect(povertyDeliveredPressure([program], new Map(), 10)).toBe(0);
    expect(
      povertyDeliveredPressure(
        [{ ...program, effectiveTurn: 11 }],
        new Map([["law", { implementationFactor: 1, lastSettledTurn: 10 }]]),
        10
      )
    ).toBe(0);
    expect(
      povertyDeliveredPressure(
        [program],
        new Map([["law", { implementationFactor: 1, lastSettledTurn: 9, validThroughTurn: 10 }]]),
        10
      )
    ).toBeCloseTo(0.72);
  });

  it("never clips multiple laws before applying diminishing returns", () => {
    expect(povertyLawRelief(2)).toBeGreaterThan(povertyLawRelief(1));
    expect(povertyLawRelief(4)).toBeGreaterThan(povertyLawRelief(2));
    expect(povertyLawRelief(1000)).toBeLessThan(6);
    expect(povertyLawRelief(-1)).toBe(-3);
    expect(povertyLawRelief(NaN)).toBe(0);
  });

  it("replaces, rather than adds to, legacy spending for v2 relief", () => {
    expect(povertyTarget({ socialSpending: 2700 })).toBe(10);
    expect(povertyTarget({ socialSpending: 2700, policy: { deliveredPressure: 0 } })).toBe(13);
    expect(povertyTarget({ socialSpending: 1e9, policy: { deliveredPressure: 1 } })).toBe(10);
    expect(povertyTarget({ unemployment: 10 }) - povertyTarget({ unemployment: 5 })).toBe(3);
    expect(povertyTarget({ crime: 9500 }) - povertyTarget({ crime: 4500 })).toBe(2);
  });

  it("smooths old positive and negative residuals away without a deployment reset", () => {
    for (const offset of [-4, 8]) {
      let value = 13 + offset;
      let baseline = 13;
      const start = value;
      for (let turn = 1; turn <= 192; turn++) {
        const result = evalNode(
          povertyRateNode,
          {
            current: {},
            prev: { "economic.povertyRate": value },
            prevSimBaseline: { "economic.povertyRate": baseline },
            policyValue: value,
            spending: {},
            providers: { povertyPolicy: { deliveredPressure: 0 } },
          },
          "test"
        );
        value = result.value;
        baseline = result.simBaseline;
        if (turn === 1) expect(Math.abs(value - start)).toBeLessThan(0.2);
        if (turn === 48) expect(Math.abs(value - 13)).toBeCloseTo(Math.abs(offset) / 2, 0);
      }
      expect(Math.abs(value - 13)).toBeLessThan(0.2);
    }
  });

  it("does not preserve small residuals forever at display precision", () => {
    for (const offset of [-0.3, 0.3]) {
      let value = 13 + offset;
      for (let turn = 0; turn < 48; turn++) {
        value = evalNode(
          povertyRateNode,
          {
            current: {},
            prev: { "economic.povertyRate": value },
            prevSimBaseline: { "economic.povertyRate": 13 },
            policyValue: value,
            spending: {},
            providers: { povertyPolicy: { deliveredPressure: 0 } },
          },
          "test"
        ).value;
      }
      expect(value).toBe(13);
    }
  });

  it("preserves the policy channel in legacy worlds without a funded law owner", () => {
    expect(
      evalNode(
        povertyRateNode,
        {
          current: {},
          prev: { "economic.povertyRate": 20 },
          prevSimBaseline: { "economic.povertyRate": 13 },
          policyValue: 20,
          providers: {},
          spending: {},
        },
        "legacy"
      ).value
    ).toBe(20);
  });
});
