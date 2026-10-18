import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import { loadEmploymentPolicies } from "./employmentPolicies";

function fixture() {
  const db = createMockDb();
  const seed = (name: string, rows: unknown[]) => {
    const cursor = { toArray: vi.fn().mockResolvedValue(rows), project: vi.fn() };
    cursor.project.mockReturnValue(cursor);
    db.collection(name).find.mockReturnValue(cursor);
  };
  seed("statePolicies", [
    {
      stateId: "jp_national",
      legislationTypeId: "jp_training",
      policyOptionIndex: 2,
      enactedTurn: 1,
    },
    { stateId: "HOK", legislationTypeId: "jp_training", policyOptionIndex: 0, enactedTurn: 20 },
    { stateId: "HOK", legislationTypeId: "jp_training", policyOptionIndex: 4, enactedTurn: 10 },
    {
      stateId: "uk_national",
      legislationTypeId: "uk.education.adultSkills.primary",
      policyOptionIndex: 3,
      enactedTurn: 1,
    },
    {
      stateId: "federal",
      legislationTypeId: "us.education.adultSkills.primary",
      policyOptionIndex: 0,
      enactedTurn: 1,
    },
  ]);
  seed("enactedLaws", []);
  seed("legislationTypes", [
    {
      _id: "jp_training",
      countryScope: "jp",
      name: "Vocational Training Act",
      effectTarget: { metricCategoryId: "economic", metricId: "unemploymentRate" },
      policyOptions: Array.from({ length: 5 }, (_, i) => ({ id: `opt_${i}`, name: "Training" })),
    },
  ]);
  return { db: db as unknown as Db, raw: db, seed };
}

describe("employment legislation readback", () => {
  const regions = [
    { _id: "LON", countryId: "UK" as const },
    { _id: "CA", countryId: "US" as const },
    { _id: "HOK", countryId: "JP" as const },
    { _id: "TOH", countryId: "JP" as const },
    { _id: "DE_BW", countryId: "DE" as const },
  ];

  it("reads both catalog directions, historical enactments, latest regional options and country boundaries", async () => {
    const { db } = fixture();
    const policies = await loadEmploymentPolicies(db, 48, regions, {
      national: false,
      regional: false,
    });
    expect(policies.get("LON")?.matching).toBe(0.5);
    expect(policies.get("CA")?.matching).toBe(0);
    expect(policies.get("HOK")?.matching).toBe(1);
    expect(policies.get("TOH")?.matching).toBe(0);
    expect(policies.get("DE_BW")?.matching).toBe(0);
  });

  it("recognizes an enacted law with no state-policy row, without requiring it to be passed again", async () => {
    const { db, seed } = fixture();
    seed("statePolicies", []);
    seed("enactedLaws", [
      { legislationTypeId: "jp_training", scope: "national", policyOptionIndex: 0 },
    ]);
    const policies = await loadEmploymentPolicies(db, 48, regions, {
      national: false,
      regional: false,
    });
    expect(policies.get("HOK")?.matching).toBe(1);
    expect(policies.get("TOH")?.matching).toBe(1);
    expect(policies.get("LON")?.matching).toBe(0);
  });

  it("requires current delivery for managed programs and respects regional settlement cadence", async () => {
    const { db, seed } = fixture();
    seed("statePolicies", [
      { stateId: "HOK", legislationTypeId: "jp_training", policyOptionIndex: 0, enactedTurn: 1 },
    ]);
    seed("legislationTypes", [
      {
        _id: "jp_training",
        name: "Vocational Training",
        policyOptions: [
          { id: "opt_0", name: "Training", implementation: { capacityType: "training" } },
          { id: "opt_1", name: "None" },
        ],
      },
    ]);
    const missing = await loadEmploymentPolicies(db, 48, regions, {
      national: false,
      regional: true,
    });
    expect(missing.get("HOK")?.matching).toBe(0);
    seed("regionalBudgets", [
      {
        _id: "HOK",
        programSettlements: {
          training: {
            legislationTypeId: "jp_training",
            implementationFactor: 0.75,
            lastSettledTurn: 44,
            validThroughTurn: 48,
          },
        },
      },
    ]);
    const funded = await loadEmploymentPolicies(db, 48, regions, {
      national: false,
      regional: true,
    });
    expect(funded.get("HOK")?.matching).toBe(0.5);
    const stale = await loadEmploymentPolicies(db, 49, regions, {
      national: false,
      regional: true,
    });
    expect(stale.get("HOK")?.matching).toBe(0);
  });

  it("distributes a national jobs-program appropriation once across its regions", async () => {
    const { db, seed } = fixture();
    seed("statePolicies", []);
    seed("enactedLaws", [
      {
        legislationTypeId: "jp_training",
        scope: "national",
        policyOptionIndex: 0,
        annualCostUsd: 1_000_000,
      },
    ]);
    seed("legislationTypes", [
      {
        _id: "jp_training",
        countryScope: "jp",
        name: "Workforce Development",
        policyOptions: [
          { id: "opt_0", name: "Universal Jobs Guarantee" },
          { id: "opt_1", name: "No Provision" },
        ],
      },
    ]);
    const policies = await loadEmploymentPolicies(
      db,
      48,
      [
        { _id: "HOK", countryId: "JP", population: 100 },
        { _id: "TOH", countryId: "JP", population: 300 },
      ],
      { national: false, regional: false }
    );
    expect(policies.get("HOK")?.publicEmploymentAnnual).toBe(150_000);
    expect(policies.get("TOH")?.publicEmploymentAnnual).toBe(450_000);
  });
});
