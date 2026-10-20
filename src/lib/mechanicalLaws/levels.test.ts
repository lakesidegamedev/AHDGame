import type { Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { ANTITRUST_LAW_BY_COUNTRY } from "@/lib/corporations/mergerReview/constants";
import { NATIONAL_POLICY_STATE_IDS } from "@/lib/policy/nationalStateId";
import { getLaw } from "@/lib/politicalLegislation/catalog";
import { getMechanicalLawLevels, getMechanicalLawLevelsByCountry } from "./levels";
import { clampMechanicalLevel } from "./rules";

interface StatePolicyRow {
  stateId: string;
  legislationTypeId: string;
  policyOptionIndex?: number;
}

interface FindFilter {
  stateId: { $in: string[] };
  legislationTypeId: { $in: string[] };
}

function setup(rows: StatePolicyRow[]) {
  const find = vi.fn((filter: FindFilter) => ({
    toArray: async () =>
      rows.filter(
        (row) =>
          filter.stateId.$in.includes(row.stateId) &&
          filter.legislationTypeId.$in.includes(row.legislationTypeId)
      ),
  }));
  const db = {
    collection: vi.fn(() => ({ find })),
  } as unknown as Db;
  return { db, find };
}

describe("getMechanicalLawLevels", () => {
  it("falls back to the starting levels when no bill has passed", async () => {
    const { db } = setup([]);

    const levels = await getMechanicalLawLevels(db, "FR");

    expect(levels.competition).toBe(2);
    expect(levels.subsidiaryLimits).toBe(0);
    expect(levels.foreignInvestment).toBe(0);
  });

  it("reads an enacted option index as the law level", async () => {
    const { db } = setup([
      {
        stateId: NATIONAL_POLICY_STATE_IDS.FR,
        legislationTypeId: "fr_subsidiary_limits_law",
        policyOptionIndex: 4,
      },
    ]);

    const levels = await getMechanicalLawLevels(db, "FR");

    expect(levels.subsidiaryLimits).toBe(4);
  });

  it("clamps out-of-range stored indexes", async () => {
    const { db } = setup([
      {
        stateId: NATIONAL_POLICY_STATE_IDS.FR,
        legislationTypeId: "fr_competition_law",
        policyOptionIndex: -3,
      },
      {
        stateId: NATIONAL_POLICY_STATE_IDS.FR,
        legislationTypeId: "fr_foreign_investment_law",
        policyOptionIndex: 9,
      },
    ]);

    const levels = await getMechanicalLawLevels(db, "FR");

    expect(levels.competition).toBe(0);
    expect(levels.foreignInvestment).toBe(4);
  });

  it("ignores a row written for another country's national state", async () => {
    const { db } = setup([
      {
        stateId: NATIONAL_POLICY_STATE_IDS.JP,
        legislationTypeId: "fr_subsidiary_limits_law",
        policyOptionIndex: 4,
      },
    ]);

    const levels = await getMechanicalLawLevels(db, "FR");

    expect(levels.subsidiaryLimits).toBe(0);
  });
});

describe("getMechanicalLawLevelsByCountry", () => {
  it("reads every country in exactly one query", async () => {
    const { db, find } = setup([
      {
        stateId: NATIONAL_POLICY_STATE_IDS.FR,
        legislationTypeId: "fr_subsidiary_limits_law",
        policyOptionIndex: 3,
      },
    ]);

    const levels = await getMechanicalLawLevelsByCountry(db, ["FR", "JP", "US"]);

    expect(find).toHaveBeenCalledTimes(1);
    expect(levels.size).toBe(3);
    expect(levels.get("FR")?.subsidiaryLimits).toBe(3);
  });

  it("uses the new-generation law's authored baseline for US competition", async () => {
    const lawId = ANTITRUST_LAW_BY_COUNTRY.US!;
    const law = getLaw(lawId);
    expect(law).not.toBeNull();
    const { db } = setup([]);

    const levels = (await getMechanicalLawLevelsByCountry(db, ["FR", "JP", "US"])).get("US")!;

    expect(levels.competition).toBe(clampMechanicalLevel(law!.baselineLevel ?? 0));
    expect(levels.competition).toBe(2);
  });
});
