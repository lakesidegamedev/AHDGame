import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { resolvePolicyProvision } from "./resolvePolicyProvision";

const LT = {
  _id: "ru_health",
  name: "Regional Health Programme",
  policyDomain: "welfare",
  effectTargetsWeighted: [
    { metricCategoryId: "society", metricId: "healthcareQuality", weight: 1 },
  ],
  policyOptions: [
    {
      id: "o1",
      name: "Minimal",
      effectDirection: 1,
      explanation: "Token funding.",
      economic: 2,
      social: 0,
    },
    {
      id: "o2",
      name: "Universal",
      effectDirection: -1,
      explanation: "Full coverage.",
      economic: -2,
      social: 0,
    },
  ],
};

const REGION = { scope: "region" as const, countryId: "RU" as const, regionId: "MOW" };

describe("resolvePolicyProvision", () => {
  let db: MockDb;
  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
  });

  it.each(["US", "UK", "JP"] as const)(
    "previews %s corporate tax with rate-based income reactions instead of legacy option signs",
    async (countryId) => {
      db.collection("federalBudget").findOne.mockResolvedValue({
        taxRates: { domesticCorporateTax: 30 },
      });
      const out = await resolvePolicyProvision(db as unknown as Db, {
        scope: { scope: "national", countryId },
        lt: {
          _id: "corp",
          name: "Corporate tax",
          policyDomain: "tax",
          policyOptions: [],
          taxRateChange: { scope: "federal", taxType: "domesticCorporateTax" },
        } as never,
        provision: {
          legislationTypeId: "corp",
          policyOptionId: "rate:20",
          proposedRate: 20,
          effectDirection: -1,
        },
        live: undefined,
        legislationTypeName: "Corporate tax",
        directionLabel: "Right",
      });
      const dimension = countryId === "US" ? "wealth" : "income";
      expect(out.archetypeApprovals).toEqual({
        [`${dimension}:low`]: -1,
        [`${dimension}:middle`]: -0.8,
        [`${dimension}:high`]: 1.2,
      });
      expect(out.policyDomain).toBeUndefined();
    }
  );

  it("previews no corporate tax reward for a destination already scheduled", async () => {
    db.collection("federalBudget").findOne.mockResolvedValue({
      taxRates: { domesticCorporateTax: 29 },
      taxRatePhaseIn: { domesticCorporateTax: 20 },
    });
    const out = await resolvePolicyProvision(db as unknown as Db, {
      scope: { scope: "national", countryId: "UK" },
      lt: {
        _id: "corp",
        policyDomain: "tax",
        policyOptions: [],
        taxRateChange: { scope: "federal", taxType: "domesticCorporateTax" },
      } as never,
      provision: { legislationTypeId: "corp", proposedRate: 20, effectDirection: -1 },
      live: undefined,
      legislationTypeName: "Corporate tax",
      directionLabel: "Right",
    });
    expect(out.archetypeApprovals).toEqual({});
    expect(out.policyDomain).toBeUndefined();
  });

  it("emits structured proposed and current labels from snapshots", async () => {
    const out = await resolvePolicyProvision(db as unknown as Db, {
      scope: REGION,
      lt: LT as never,
      provision: {
        legislationTypeId: "ru_health",
        policyOptionId: "o2",
        effectDirection: -1,
        currentPolicyOptionIdSnapshot: "o1",
      },
      live: { policyOptionIndex: 1 }, // live == proposed, post-enactment
      legislationTypeName: "Regional Health Programme",
      directionLabel: "Left",
    });

    expect(out.proposed).toEqual({ name: "Universal", explanation: "Full coverage." });
    expect(out.current).toEqual({ name: "Minimal", explanation: "Token funding." });
    expect(out.proposedPolicyIndex).toBe(1);
    expect(out.currentPolicyIndex).toBe(0);
  });

  it("produces effect chips for the delta between current and proposed", async () => {
    const out = await resolvePolicyProvision(db as unknown as Db, {
      scope: REGION,
      lt: LT as never,
      provision: {
        legislationTypeId: "ru_health",
        policyOptionId: "o2",
        effectDirection: -1,
        currentPolicyOptionIdSnapshot: "o1",
      },
      live: undefined,
      legislationTypeName: "Regional Health Programme",
      directionLabel: "Left",
    });
    expect(out.effects?.length).toBeGreaterThan(0);
  });

  it("carries policyOptionScores, position axes and the policy domain", async () => {
    const out = await resolvePolicyProvision(db as unknown as Db, {
      scope: { scope: "national", countryId: "RU" },
      lt: LT as never,
      provision: {
        legislationTypeId: "ru_health",
        policyOptionId: "o2",
        effectDirection: -1,
        economic: -2,
        social: 0,
      },
      live: undefined,
      legislationTypeName: "Regional Health Programme",
      directionLabel: "Left",
    });
    expect(out.policyOptionScores).toEqual([2, -2]);
    expect(out.economic).toBe(-2);
    expect(out.policyDomain).toBe("welfare");
  });

  it("omits an axis the ladder does not use, as the adapters always did", async () => {
    // Every option has social 0, so social is not a relevant axis for this law.
    const out = await resolvePolicyProvision(db as unknown as Db, {
      scope: REGION,
      lt: LT as never,
      provision: {
        legislationTypeId: "ru_health",
        policyOptionId: "o2",
        effectDirection: -1,
        economic: -2,
        social: 0,
      },
      live: undefined,
      legislationTypeName: "Regional Health Programme",
      directionLabel: "Left",
    });
    expect(out).not.toHaveProperty("social");
    expect(out.economic).toBe(-2);
  });

  it("synthesizes a chip from the headline effectTarget when there are no weighted targets", async () => {
    // This fallback was national-only before the merge; regional bills had none.
    const lt = {
      ...LT,
      effectTargetsWeighted: [],
      effectTarget: { metricCategoryId: "society", metricId: "healthcareQuality" },
    };
    const out = await resolvePolicyProvision(db as unknown as Db, {
      scope: REGION,
      lt: lt as never,
      provision: {
        legislationTypeId: "ru_health",
        policyOptionId: "o2",
        effectDirection: -1,
        currentPolicyOptionIdSnapshot: "o1",
      },
      live: undefined,
      legislationTypeName: "Regional Health Programme",
      directionLabel: "Left",
    });
    expect(out.effects?.length).toBeGreaterThan(0);
    expect(out.effectTargetLabel).toBeDefined();
  });

  it("never synthesizes a chip for a mirror-controlled metric", async () => {
    // Mirror-owned metrics never move from legislation, and the synthesized
    // weight of +1 would flip the displayed sign.
    const lt = {
      ...LT,
      effectTargetsWeighted: [],
      effectTarget: { metricCategoryId: "economy", metricId: "budgetBalance" },
    };
    const out = await resolvePolicyProvision(db as unknown as Db, {
      scope: REGION,
      lt: lt as never,
      provision: {
        legislationTypeId: "ru_health",
        policyOptionId: "o2",
        effectDirection: -1,
        currentPolicyOptionIdSnapshot: "o1",
      },
      live: undefined,
      legislationTypeName: "Regional Health Programme",
      directionLabel: "Left",
    });
    expect(out.effects ?? []).toEqual([]);
  });

  it("falls back to the resolved option's axis when the provision stamps none", async () => {
    // The national adapter read only the provision's stamped axis; the regional
    // one read only the option's. Region provisions often stamp neither, so
    // reading the provision alone would empty the position badges there.
    const out = await resolvePolicyProvision(db as unknown as Db, {
      scope: REGION,
      lt: LT as never,
      provision: { legislationTypeId: "ru_health", policyOptionId: "o2", effectDirection: -1 },
      live: undefined,
      legislationTypeName: "Regional Health Programme",
      directionLabel: "Left",
    });
    expect(out.economic).toBe(-2);
  });

  it("falls back to the direction label when nothing resolves", async () => {
    const out = await resolvePolicyProvision(db as unknown as Db, {
      scope: REGION,
      lt: null,
      provision: { legislationTypeId: "unknown_law", effectDirection: 1 },
      live: undefined,
      legislationTypeName: "Unknown Law",
      directionLabel: "Right",
    });
    expect(out.proposed).toEqual({ name: "Right policy" });
    expect(out.current).toBeUndefined();
  });

  it("prefers an explicit position label over the direction fallback", async () => {
    const out = await resolvePolicyProvision(db as unknown as Db, {
      scope: REGION,
      lt: null,
      provision: { legislationTypeId: "unknown_law", effectDirection: 1 },
      live: undefined,
      legislationTypeName: "Unknown Law",
      directionLabel: "Right",
      positionLabel: "Economically Right",
    });
    expect(out.proposed).toEqual({ name: "Economically Right" });
    expect(out.positionLabel).toBe("Economically Right");
  });
});
