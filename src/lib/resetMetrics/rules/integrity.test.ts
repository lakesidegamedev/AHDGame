import { describe, it, expect } from "vitest";
import { deliveredLawFactor, deliveredMetricEffects, type MetricLawProgram } from "./lawDelivery";
import { commodityTradeBalance } from "./tradeOwner";
import { latestTurnoutReceipts } from "./turnoutOwner";
import {
  aggregateNationalMetricValue,
  aggregateNationalMetricHistory,
} from "./nationalAggregation";
import { primaryMetricById } from "../catalog";
import { ownedLegacyValues, ownedPoliticalModifiers } from "./ownedInputs";
import { buildOpeningMetricSnapshots1991 } from "../seedOpening1991";
import { policyDriftTarget } from "./policyDrift";
import type { PoliticalMetricId } from "@/lib/politicalMetrics/types";

const program: MetricLawProgram = {
  _id: "law",
  country: "UK",
  scope: "regional",
  regionId: "LON",
  familyId: "L25",
  fundingAccountId: "regional_budget",
  effectiveTurn: 2,
  primaryMetricEffects: [{ metricId: "26", favorableNormalizedPoints: 0.8 }],
};
describe("shared metric integrity rules", () => {
  it("does not turn a display plateau into a physical cap or an exaggerated reverse step", () => {
    const metric = primaryMetricById("38")!;
    const args = {
      metric,
      currentValue: 65,
      openingValue: 65,
      countryId: "JP" as const,
      year: 1991,
    };
    const better = policyDriftTarget({ ...args, pressure: 0.8 })!;
    const worse = policyDriftTarget({ ...args, pressure: -0.8 })!;
    expect(better).toBeGreaterThan(65);
    expect(better).toBeLessThanOrEqual(100);
    expect(worse).toBeLessThan(65);
    expect(better - 65).toBeCloseTo(65 - worse);
    expect(
      policyDriftTarget({
        ...args,
        metric: primaryMetricById("58")!,
        currentValue: 10,
        openingValue: 10,
        pressure: 1.2,
      })
    ).toBeGreaterThanOrEqual(0);
    expect(
      policyDriftTarget({
        ...args,
        metric: primaryMetricById("15")!,
        currentValue: 207,
        openingValue: 207,
        pressure: 0.8,
      })
    ).toBeGreaterThan(207);
  });
  it("requires fresh post-enactment funding, including existing programs", () => {
    expect(deliveredLawFactor(program, undefined, 10)).toBe(0);
    expect(
      deliveredLawFactor(
        { ...program, effectiveTurn: 11 },
        { lastSettledTurn: 10, implementationFactor: 1 },
        10
      )
    ).toBe(0);
    expect(
      deliveredLawFactor(
        program,
        { lastSettledTurn: 9, validThroughTurn: 9, implementationFactor: 1 },
        10
      )
    ).toBe(0);
    expect(
      deliveredLawFactor(
        program,
        { lastSettledTurn: 1, validThroughTurn: 10, implementationFactor: 1 },
        10
      )
    ).toBe(0);
    expect(deliveredLawFactor(program, { lastSettledTurn: 11, implementationFactor: 1 }, 10)).toBe(
      0
    );
    expect(
      deliveredLawFactor(
        { ...program, choice: "leave_to_states" },
        { lastSettledTurn: 10, implementationFactor: 1 },
        10
      )
    ).toBe(0);
    expect(
      deliveredMetricEffects(
        [program],
        new Map([["law", { lastSettledTurn: 9, validThroughTurn: 10, implementationFactor: 0.5 }]]),
        10
      )["26"]
    ).toBe(0.4);
  });
  it("annualizes commodity flows with a currency-normalized annual GDP and conserves net exports", () => {
    const a = commodityTradeBalance({
      exports: 120,
      imports: 20,
      annualGdpAnchor: 48000,
      turnsPerYear: 48,
    });
    const b = commodityTradeBalance({
      exports: 20,
      imports: 120,
      annualGdpAnchor: 48000,
      turnsPerYear: 48,
    });
    expect(a).toBe(10);
    expect(b).toBe(-10);
    expect(
      commodityTradeBalance({ exports: 120, imports: 20, annualGdpAnchor: 0, turnsPerYear: 48 })
    ).toBeNull();
  });
  it("takes one latest completed ballot, without double-counting offices or accepting impossible turnout", () => {
    const rows = [
      { regionId: "A", turn: 5, ballots: 60, eligible: 100, key: "senate" },
      { regionId: "A", turn: 5, ballots: 70, eligible: 100, key: "president" },
      { regionId: "A", turn: 6, ballots: 80, eligible: 100, key: "later" },
    ];
    expect(latestTurnoutReceipts(rows, 5).get("A")?.ballots).toBe(70);
    expect(latestTurnoutReceipts(rows, 6).get("A")?.ballots).toBe(80);
    expect(latestTurnoutReceipts([{ ...rows[0]!, ballots: 101 }], 6).size).toBe(0);
  });
  it("uses actual denominators for unemployment and dependency, including sampled history", () => {
    for (const id of ["01", "56"]) {
      const m = primaryMetricById(id)!;
      const reading = (
        regionId: string,
        value: number,
        numerator: number,
        denominator: number
      ) => ({
        regionId,
        population: 100,
        workingAgePopulation: 100,
        observations: {
          [id]: {
            metricId: id,
            path: m.path,
            owner: m.owner,
            value,
            status: "derived" as const,
            source: "counts",
            note: "counts",
            ratioBasis: { numerator, denominator },
          },
        },
        history: { [id]: [{ turn: 5, value, ratioBasis: { numerator, denominator } }] },
      });
      const regions = [reading("A", 0, 0, 90), reading("B", 100, 10, 10)];
      expect(aggregateNationalMetricValue(id, regions)).toBe(10);
      expect(aggregateNationalMetricHistory(id, regions)).toEqual([{ turn: 5, value: 10 }]);
    }
  });
  it("uses identical owned values for the board, causal inputs, and corporate margins", () => {
    const board = buildOpeningMetricSnapshots1991("world", 1).find((b) => b._id === "UK:LON")!;
    const observations = {
      ...board.observations,
      "04": { ...board.observations["04"]!, value: 23 },
      "16": { ...board.observations["16"]!, value: 90 },
    };
    const values = ownedLegacyValues(observations);
    expect(values["social.incomeInequality"]).toBe(23);
    expect(values["healthcare.uninsuredRate"]).toBe(10);
    expect(values["population.birthRate"]).toBeUndefined();
    expect(values["population.totalFertilityRate"]).toBe(board.observations["55"]!.value);
    const prior = {} as Record<PoliticalMetricId, number>;
    const margin = ownedPoliticalModifiers(prior, observations, "UK", 1991);
    const worse = ownedPoliticalModifiers(
      prior,
      { ...observations, "04": { ...observations["04"], value: 55 } },
      "UK",
      1991
    );
    expect(margin.get("social.incomeInequality")!.modifier).toBeGreaterThan(
      worse.get("social.incomeInequality")!.modifier
    );
  });
});
