import { describe, it, expect, vi, beforeEach } from "vitest";
import { ObjectId, type Db } from "mongodb";

// The restructure resolution runs for real, so the test proves the spiral goes
// through the existing haircut and market-lock path. Only its side effects on
// other systems (bonds, trust, FX, cascade, unrest) are stubbed at the module
// boundary, as restructure.test.ts does.
vi.mock("../bondMutations/restructure", () => ({
  applyCountryBondRestructure: vi.fn().mockResolvedValue({ bondsAffected: 4 }),
}));
vi.mock("../sideEffects/trustHit", () => ({
  applyCrossCountryTrustHit: vi.fn().mockResolvedValue({ statesUpdated: 0 }),
}));
vi.mock("../sideEffects/fxDepreciation", () => ({
  applyExchangeRateDepreciation: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("../crisisNews", () => ({
  emitRestructuredNews: vi.fn().mockResolvedValue(undefined),
  emitInterestSpiralCrisisNews: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../cascade/cascadeOrchestrator", () => ({
  runCascade: vi.fn().mockResolvedValue({
    levels: 0,
    totalBondsCascaded: 0,
    totalCorpsInsolvent: 0,
    perLevelReports: [],
    insolventCorpIdsByLevel: [],
  }),
}));
vi.mock("../cascade/cascadeNews", () => ({
  emitCascadeSummaryNews: vi.fn().mockResolvedValue(undefined),
  emitMassCascadeAlert: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../political/civilUnrestEvents", () => ({
  emitCivilUnrestEvents: vi.fn().mockResolvedValue({ eventsEmitted: 0 }),
}));
vi.mock("../political/executivePoliticalImpact", () => ({
  applyExecutivePoliticalImpact: vi.fn().mockResolvedValue({ applied: false }),
}));

import { restructureForInterestSpiral } from "../interestSpiralRestructure";
import { applyCountryBondRestructure } from "../bondMutations/restructure";
import { emitInterestSpiralCrisisNews } from "../crisisNews";
import { RESTRUCTURE_HAIRCUT, RESTRUCTURE_LOCKOUT_TURNS } from "../constants";

type Row = Record<string, unknown>;

function world(initial: Row) {
  const row: Row = { ...initial };
  const decisions: Row[] = [];
  const decisionUpdates: Row[] = [];
  const db = {
    collection: vi.fn((name: string) => {
      switch (name) {
        case "federalBudget":
          return {
            findOne: vi.fn(async () => ({ ...row })),
            updateOne: vi.fn(async (filter: Row, update: { $set: Row }) => {
              if ("sovereignCrisisState" in filter) {
                const current = row.sovereignCrisisState ?? null;
                if (current !== filter.sovereignCrisisState) return { matchedCount: 0 };
              }
              for (const [key, value] of Object.entries(update.$set)) {
                if (key === "fiscalConsolidation.interestSpiralYears") {
                  row.fiscalConsolidation = {
                    ...(row.fiscalConsolidation as Row),
                    interestSpiralYears: value,
                  };
                } else row[key] = value;
              }
              return { matchedCount: 1, modifiedCount: 1 };
            }),
          };
        case "sovereignCrisisDecisions":
          return {
            insertOne: vi.fn(async (doc: Row) => {
              decisions.push(doc);
              return { insertedId: doc._id };
            }),
            updateOne: vi.fn(async (_f: Row, update: { $set: Row }) => {
              decisionUpdates.push(update.$set);
              return { matchedCount: 1 };
            }),
            findOne: vi.fn(async () => decisions[0] ?? null),
          };
        case "bonds":
          return { find: vi.fn(() => ({ toArray: vi.fn(async () => []) })) };
        default:
          throw new Error(`unexpected collection: ${name}`);
      }
    }),
  } as unknown as Db;
  return { db, row: () => row, decisions, decisionUpdates };
}

const ITALY = {
  _id: "IT",
  countryId: "IT",
  gdp: 2_455,
  debtToGdpRatio: 4.5,
  debt: { principal: 11_081, interestRate: 0.14, ceiling: 13_000, ceilingLastRaisedYear: 2005 },
  sovereignCrisisState: "normal",
};

beforeEach(() => vi.clearAllMocks());

describe("restructureForInterestSpiral", () => {
  it("restructures through the default path after two spiral years", async () => {
    const w = world({ ...ITALY, fiscalConsolidation: { interestSpiralYears: 2 } });
    const result = await restructureForInterestSpiral(w.db, "IT", 760, 1_000);

    expect(result).toEqual({ ok: true, bondsAffected: 4 });
    expect(applyCountryBondRestructure).toHaveBeenCalledWith(
      w.db,
      "IT",
      RESTRUCTURE_HAIRCUT,
      expect.any(Number)
    );
    expect(emitInterestSpiralCrisisNews).toHaveBeenCalledWith("IT", 760, 2);
    expect(w.decisions).toHaveLength(1);
    expect(w.decisionUpdates[0]).toMatchObject({
      state: "ratified",
      executiveChoice: "restructure",
    });
    const after = w.row();
    expect(after.sovereignCrisisState).toBe("recovering");
    expect(after.crisisChoice).toBe("restructure");
    expect(after.marketAccessLockedUntilTurn).toBe(760 + RESTRUCTURE_LOCKOUT_TURNS);
    // The clock restarts: another restructuring needs two more spiral years.
    expect((after.fiscalConsolidation as Row).interestSpiralYears).toBe(0);
  });

  it("waits until the second spiral year", async () => {
    const w = world({ ...ITALY, fiscalConsolidation: { interestSpiralYears: 1 } });
    expect(await restructureForInterestSpiral(w.db, "IT", 760, 1_000)).toEqual({
      ok: false,
      reason: "not-due",
    });
    expect(applyCountryBondRestructure).not.toHaveBeenCalled();
  });

  it("leaves a crisis the auctions already fired to its own resolution", async () => {
    for (const state of ["crisisPending", "crisisResolving", "recovering"]) {
      const w = world({
        ...ITALY,
        sovereignCrisisState: state,
        fiscalConsolidation: { interestSpiralYears: 3 },
      });
      expect(await restructureForInterestSpiral(w.db, "IT", 760, 1_000)).toEqual({
        ok: false,
        reason: "crisis-in-progress",
      });
    }
    expect(applyCountryBondRestructure).not.toHaveBeenCalled();
  });

  it("fires from a country with no crisis state recorded yet", async () => {
    const { sovereignCrisisState: _unused, ...noState } = ITALY;
    const w = world({ ...noState, fiscalConsolidation: { interestSpiralYears: 2 } });
    const result = await restructureForInterestSpiral(w.db, "IT", 760, 1_000);
    expect(result.ok).toBe(true);
    expect(w.decisions[0]._id).toBeInstanceOf(ObjectId);
  });
});
