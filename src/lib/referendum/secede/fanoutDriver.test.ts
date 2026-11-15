import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { applyFanout, buildFanoutContext } from "./fanoutDriver";
import { SECEDE_FANOUT } from "./fanoutPolicy";
import { scoRegions } from "@/lib/seeds/sco/scoRegions";

const ctx = buildFanoutContext("SCO", scoRegions);
const scopeFor = (c: string) => SECEDE_FANOUT.find((s) => s.collection === c)!;

function seedAggregate(db: MockDb, collection: string, doc: Record<string, unknown>) {
  db.collection(collection).findOne.mockImplementation(async (q: { _id: string }) =>
    q._id === "SCO" ? doc : null
  );
}
function insertedDocs(db: MockDb, collection: string): Array<Record<string, unknown>> {
  return db.collectionMocks[collection]!.insertMany.mock.calls[0]?.[0] ?? [];
}

describe("applyFanout", () => {
  let db: MockDb;
  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
  });

  it("cloneIdentical copies the aggregate metric to each sub-region unchanged", async () => {
    seedAggregate(db, "macroMetrics", { _id: "SCO", countryId: "SCO", approval: 50, growth: 2 });
    const writes = await applyFanout(db as unknown as Db, scopeFor("macroMetrics"), ctx);
    expect(writes).toBe(7);
    const docs = insertedDocs(db, "macroMetrics");
    expect(docs.map((d) => d._id).sort()).toEqual(scoRegions.map((s) => s._id).sort());
    for (const d of docs) expect(d.approval).toBe(50);
    expect(db.collectionMocks["macroMetrics"]!.deleteOne).toHaveBeenCalledWith({ _id: "SCO" });
  });

  it("scaleCounts splits age vectors so each cohort index conserves", async () => {
    const male = scoRegions.map((_, i) => 700 + i); // arbitrary per-index counts
    const female = scoRegions.map((_, i) => 800 + i);
    seedAggregate(db, "regionDemographics", {
      _id: "SCO",
      countryId: "SCO",
      ages: { male, female },
      lastUpdated: new Date(0),
    });
    await applyFanout(db as unknown as Db, scopeFor("regionDemographics"), ctx);
    const docs = insertedDocs(db, "regionDemographics") as Array<{
      ages: { male: number[]; female: number[] };
    }>;
    for (let i = 0; i < male.length; i++) {
      expect(docs.reduce((s, d) => s + d.ages.male[i], 0)).toBe(male[i]);
      expect(docs.reduce((s, d) => s + d.ages.female[i], 0)).toBe(female[i]);
    }
  });

  it("copyDoc copies rate modifiers verbatim to each sub-region", async () => {
    seedAggregate(db, "stateDemographicTurnout", {
      _id: "SCO",
      countryId: "SCO",
      modifiers: { voterGroups: { urban_progressives: 4 } },
    });
    await applyFanout(db as unknown as Db, scopeFor("stateDemographicTurnout"), ctx);
    const docs = insertedDocs(db, "stateDemographicTurnout") as Array<{
      modifiers: { voterGroups: { urban_progressives: number } };
    }>;
    expect(docs).toHaveLength(7);
    for (const d of docs) expect(d.modifiers.voterGroups.urban_progressives).toBe(4);
  });

  it("stateDemographics copies the aggregate verbatim; sub-region census carries the differences", async () => {
    const groups = {
      alpha: { population: 60, economicLean: -2, socialLean: 0, turnout: 60 },
      beta: { population: 40, economicLean: 3, socialLean: 1, turnout: 55 },
    };
    seedAggregate(db, "stateDemographics", {
      _id: "SCO",
      countryId: "SCO",
      categoryWeights: { uk_voterGroups: 100 },
      groups,
      cachedEconomicLean: -1.4,
      cachedSocialLean: -0.3,
      lastUpdated: new Date(0),
    });
    await applyFanout(db as unknown as Db, scopeFor("stateDemographics"), ctx);
    const docs = insertedDocs(db, "stateDemographics") as Array<{
      _id: string;
      groups: typeof groups;
      cachedEconomicLean?: number;
    }>;
    expect(docs).toHaveLength(7);
    expect(docs.map((d) => d._id).sort()).toEqual(scoRegions.map((r) => r._id).sort());
    for (const d of docs) {
      expect(d.groups).toEqual(groups);
      expect(d.cachedEconomicLean).toBe(-1.4);
    }
  });

  it("scaleNumeric scales magnitudes by GDP weight, copies per-capita verbatim", async () => {
    seedAggregate(db, "regionalBudgets", {
      _id: "SCO",
      countryId: "SCO",
      turn: 5,
      totalBudget: 1_000_000,
      westminsterGrant: 400_000,
      surplus: 100_000,
      propertyValuePerCapita: 250, // intensive — must NOT scale
      isOverBudget: false,
    });
    await applyFanout(db as unknown as Db, scopeFor("regionalBudgets"), ctx);
    const docs = insertedDocs(db, "regionalBudgets") as Array<{
      totalBudget: number;
      propertyValuePerCapita: number;
      turn: number;
    }>;
    expect(docs.reduce((s, d) => s + d.totalBudget, 0)).toBeCloseTo(1_000_000, 4);
    for (const d of docs) {
      expect(d.propertyValuePerCapita).toBe(250); // copied, not scaled
      expect(d.turn).toBe(5); // copied
    }
  });
});
