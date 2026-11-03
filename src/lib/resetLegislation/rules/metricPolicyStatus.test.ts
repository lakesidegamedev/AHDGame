import { describe, expect, it } from "vitest";
import { resetLawFamilyById } from "../catalog";
import { openingLawReference } from "../openingLaw";
import { buildMetricLawStatuses, nextAnnualFundingTurn } from "./metricPolicyStatus";

describe("buildMetricLawStatuses", () => {
  const family = resetLawFamilyById("L02")!;
  const reference = openingLawReference("US", "national", family.id)!;

  it("shows the opening law as the equilibrium already reflected in the metric", () => {
    const result = buildMetricLawStatuses({
      country: "US",
      scope: "national",
      families: [family],
      references: { [family.id]: reference },
      programs: [],
      delivery: [],
    });

    expect(result["01"]).toEqual([
      expect.objectContaining({
        familyId: "L02",
        currentLawTitle: reference.currentLaw,
        state: "equilibrium",
        favorableNormalizedPoints: null,
      }),
    ]);
  });

  it("distinguishes funded movement, equilibrium, and stalled implementation", () => {
    const program = {
      familyId: "L02",
      choice: "center_left" as const,
      titleSnapshot: "Essential Benefit Guarantee",
      primaryMetricEffects: [
        { metricId: "01", favorableNormalizedPoints: 0.4 },
        { metricId: "02", favorableNormalizedPoints: 0 },
        { metricId: "03", favorableNormalizedPoints: -0.2 },
      ],
    };
    const funded = buildMetricLawStatuses({
      country: "US",
      scope: "national",
      families: [family],
      references: { [family.id]: reference },
      programs: [program],
      delivery: [{ familyId: "L02", implementationFactor: 0.5 }],
    });
    expect(funded["01"]?.[0]).toMatchObject({
      state: "pushing_favorable",
      favorableNormalizedPoints: 0.2,
    });
    expect(funded["02"]?.[0]).toMatchObject({
      state: "equilibrium",
      favorableNormalizedPoints: 0,
    });
    expect(funded["03"]?.[0]).toMatchObject({
      state: "pushing_unfavorable",
      favorableNormalizedPoints: -0.1,
    });

    const stalled = buildMetricLawStatuses({
      country: "US",
      scope: "national",
      families: [family],
      references: { [family.id]: reference },
      programs: [program],
      delivery: [{ familyId: "L02", implementationFactor: 0 }],
    });
    expect(stalled["01"]?.[0].state).toBe("implementation_stalled");
  });

  it("reports a program with no settlement row as awaiting its first funding round", () => {
    const program = {
      familyId: "L02",
      choice: "center_left" as const,
      titleSnapshot: "Essential Benefit Guarantee",
      primaryMetricEffects: [{ metricId: "01", favorableNormalizedPoints: 0.4 }],
    };
    const awaiting = buildMetricLawStatuses({
      country: "US",
      scope: "regional",
      families: [family],
      references: { [family.id]: reference },
      programs: [program],
      delivery: [{ familyId: "L02", implementationFactor: 0, awaitingFirstFunding: true }],
      nextFundingTurn: 40,
    });
    expect(awaiting["01"]?.[0]).toMatchObject({
      state: "awaiting_first_funding",
      nextFundingTurn: 40,
    });
  });

  it("finds the next annual funding turn strictly after the current turn", () => {
    const next = nextAnnualFundingTurn(10, 40);
    expect(next).toBeGreaterThan(10);
    expect(next! - 10).toBeLessThanOrEqual(48);
    expect(nextAnnualFundingTurn(next!, 40)! - next!).toBe(48);
  });
});
