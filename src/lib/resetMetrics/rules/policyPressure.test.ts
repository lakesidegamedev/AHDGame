import { describe, it, expect } from "vitest";
import { metricPolicyPressure } from "./policyPressure";
import type { MetricLawProgram } from "./lawDelivery";

const law: MetricLawProgram = {
  _id: "law",
  country: "US",
  scope: "national",
  familyId: "L16",
  fundingAccountId: "health",
  effectiveTurn: 1,
  primaryMetricEffects: [{ metricId: "16", favorableNormalizedPoints: 1.31 }],
};
const input = {
  board: { countryId: "US", scope: "national" as const },
  programs: [law],
  opening: [law],
  settlements: new Map([["law", { implementationFactor: 1, lastSettledTurn: 2 }]]),
  turn: 2,
  temporary: [],
};
describe("shared policy pressure", () => {
  it("separates gross delivery from the inherited opening baseline", () => {
    expect(metricPolicyPressure(input)["16"]).toEqual({
      grossLaw: 1.31,
      openingLaw: 1.31,
      netLaw: 0,
      cabinet: 0,
      combined: 0,
    });
    expect(metricPolicyPressure(input)).toEqual(metricPolicyPressure(input));
    expect(input.opening[0].primaryMetricEffects[0].favorableNormalizedPoints).toBe(1.31);
  });
  it("shows defunding as a loss and caps the combined Cabinet and law driver", () => {
    expect(metricPolicyPressure({ ...input, settlements: new Map() })["16"].combined).toBe(-1.2);
    expect(
      metricPolicyPressure({
        ...input,
        opening: [],
        temporary: [{ target: "M16", favorableNormalizedPoints: 0.5 }],
      })["16"]
    ).toMatchObject({ netLaw: 1.31, cabinet: 0.5, combined: 1.2 });
  });
  it("excludes other countries, other regions and future programs", () => {
    expect(
      metricPolicyPressure({
        ...input,
        opening: [],
        programs: [
          { ...law, country: "CA" },
          { ...law, scope: "regional", regionId: "CT" },
          { ...law, effectiveTurn: 3 },
        ],
      })["16"]
    ).toBeUndefined();
  });
});

it("keeps an unbooked opening regional statute in force without a receipt", () => {
  const regional = {
    ...law,
    scope: "regional" as const,
    regionId: "CT",
    settlementLawId: "opening-source",
    openingAnnualBooked: 0,
  };
  const result = metricPolicyPressure({
    ...input,
    board: { countryId: "US", scope: "regional", regionId: "CT" },
    programs: [regional],
    opening: [regional],
    settlements: new Map(),
  });
  expect(result["16"]).toMatchObject({ grossLaw: 1.31, openingLaw: 1.31, netLaw: 0, combined: 0 });
  expect(input.settlements.size).toBe(1);
});
