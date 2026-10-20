import { describe, expect, it } from "vitest";
import {
  deliveredLawFactor,
  hasCurrentLawSettlement,
  metricLawApplies,
  metricLawOutlaysAtTurn,
  type MetricLawProgram,
  type MetricLawSettlement,
} from "./lawDelivery";

const program: MetricLawProgram = {
  _id: "law",
  country: "UK",
  scope: "national",
  familyId: "L02",
  fundingAccountId: "account",
  effectiveTurn: 3,
  annualAgencyAllocation: 1000000,
  primaryMetricEffects: [{ metricId: "03", favorableNormalizedPoints: 0.5 }],
};
const paid: MetricLawSettlement = {
  implementationFactor: 0.5,
  lastSettledTurn: 10,
  outlaid: 25,
  paymentKey: "payment:10",
};
const outlays = (settlement: MetricLawSettlement | undefined, law = program) =>
  metricLawOutlaysAtTurn([law], new Map(settlement ? [[law._id, settlement]] : []), 10);

describe("actual funding evidence for outcome owners", () => {
  it("never turns appropriations or implementation ratios into household cash", () => {
    expect(outlays(undefined)).toEqual([]);
    expect(outlays({ implementationFactor: 1, lastSettledTurn: 10 })).toEqual([]);
    expect(
      outlays({
        implementationFactor: 1,
        lastSettledTurn: 10,
        fundedAnnualAmount: 1000000,
        fundingKey: "regional-budget",
      })
    ).toEqual([]);
    expect(outlays(paid)).toEqual([{ paymentKey: "payment:10", amount: 25, programIds: ["law"] }]);
    expect(deliveredLawFactor(program, paid, 10)).toBe(0.5);
  });
  it("preserves a real zero and paid costs even when service capacity is zero", () => {
    expect(outlays({ ...paid, outlaid: 0 })[0]!.amount).toBe(0);
    expect(outlays({ ...paid, implementationFactor: 0 })[0]!.amount).toBe(25);
    expect(deliveredLawFactor(program, { ...paid, implementationFactor: 0 }, 10)).toBe(0);
  });
  it("rejects future, stale, pre-enactment and devolved evidence", () => {
    for (const settlement of [
      { ...paid, lastSettledTurn: 11 },
      { ...paid, lastSettledTurn: 9 },
      { ...paid, lastSettledTurn: 2, validThroughTurn: 10 },
      { ...paid, validThroughTurn: 9 },
      { ...paid, implementationFactor: Number.NaN },
    ])
      expect(outlays(settlement)).toEqual([]);
    expect(outlays(paid, { ...program, effectiveTurn: 11 })).toEqual([]);
    expect(outlays(paid, { ...program, choice: "leave_to_states" })).toEqual([]);
  });
  it("does not replay a periodic payment on every turn of service coverage", () => {
    const periodic = { ...paid, lastSettledTurn: 9, validThroughTurn: 12 };
    expect(hasCurrentLawSettlement(program, periodic, 10)).toBe(true);
    expect(deliveredLawFactor(program, periodic, 10)).toBe(0.5);
    expect(outlays(periodic)).toEqual([]);
  });
  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 1.1])(
    "rejects invalid paid amount %s",
    (outlaid) => {
      expect(outlays({ ...paid, outlaid })).toEqual([]);
    }
  );
  it("counts the source payment once when several programs refer to it", () => {
    const other = { ...program, _id: "other" };
    const receipts = new Map([
      [program._id, paid],
      [other._id, paid],
    ]);
    expect(metricLawOutlaysAtTurn([program, other, program], receipts, 10)).toEqual([
      { paymentKey: "payment:10", amount: 25, programIds: ["law", "other"] },
    ]);
    receipts.set(other._id, { ...paid, outlaid: 26 });
    expect(() => metricLawOutlaysAtTurn([program, other], receipts, 10)).toThrow("Conflicting");
  });
  it.each(["US", "UK", "JP", "IE", "SCO", "WAL", "DE", "BR", "CN", "RU"])(
    "applies the same pure jurisdiction rules in %s without activating an unreviewed adapter",
    (country) => {
      const law = { ...program, country };
      expect(metricLawApplies(law, { countryId: country, scope: "regional", regionId: "a" })).toBe(
        true
      );
      expect(metricLawApplies(law, { countryId: "other", scope: "regional", regionId: "a" })).toBe(
        false
      );
      const regional = { ...law, scope: "regional" as const, regionId: "a" };
      expect(metricLawApplies(regional, { countryId: country, scope: "national" })).toBe(false);
      expect(
        metricLawApplies(regional, { countryId: country, scope: "regional", regionId: "b" })
      ).toBe(false);
      expect(
        metricLawApplies(regional, { countryId: country, scope: "regional", regionId: "a" })
      ).toBe(true);
    }
  );
});
