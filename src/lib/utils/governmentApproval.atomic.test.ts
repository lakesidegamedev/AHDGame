import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";

vi.mock("@/lib/db/sessionDb", () => {
  const pending = new WeakMap<object, Promise<unknown>>();
  return {
    withSessionDb: (
      db: ReturnType<typeof createInMemoryDb>,
      work: (tx: unknown) => Promise<void>
    ) => {
      const next = (pending.get(db) ?? Promise.resolve()).then(async () => {
        const before = new Map(
          [...db.collections].map(([name, col]) => [name, structuredClone(col.docs)])
        );
        try {
          await work(db);
        } catch (error) {
          for (const [name, col] of db.collections)
            col.docs.splice(0, col.docs.length, ...(before.get(name) ?? []));
          throw error;
        }
      });
      pending.set(
        db,
        next.catch(() => {})
      );
      return next;
    },
    afterCommit: vi.fn(),
    unboundDb: (db: unknown) => db,
  };
});
vi.mock("@/lib/era/context", () => ({
  getEraContext: async () => ({ preset: "2027-default", year: 2029 }),
  eraYearContextFromGameState: () => ({}),
}));
vi.mock("@/lib/country/countryTier", () => ({
  loadCountryTiers: async () => ({ fullSimulationIds: [], backgroundIds: [] }),
}));
vi.mock("@/lib/macroMetrics/merge", () => ({
  findMergedRegionMetricsMany: async () =>
    ["TX", "CT"].map((_id) => ({ _id, countryId: "US", economic: {} })),
}));
vi.mock("@/lib/politicalLegislation/politicalApprovalProvider", () => ({
  isPoliticalApprovalCountry: () => true,
  loadPoliticalApprovalBases: async () => ({
    byRegion: new Map([
      ["TX", 70],
      ["CT", 70],
    ]),
    national: 70,
    modifiersByRegion: new Map([
      ["TX", []],
      ["CT", []],
    ]),
    regionalModifiersByRegion: new Map([
      ["TX", [{ id: "regionalDebt", label: "TX debt", effect: -10, marginEffect: 0 }]],
    ]),
    nationalModifiers: [
      { id: "nationalDebt", label: "National debt", effect: -5, marginEffect: 0 },
    ],
  }),
}));
vi.mock("@/lib/military/warApproval", () => ({
  computeWarApproval: async (
    _db: unknown,
    _country: unknown,
    _turn: number,
    previous: { exhaustion?: number }
  ) => ({
    total: 0,
    exhaustion: (previous.exhaustion ?? 0) - 0.1,
    conflictId: "war",
    modifiers: [],
  }),
}));
vi.mock("@/lib/governorOffice/address/activeAddressModifiers", () => ({
  getActiveNationalAddressModifier: async () => [],
}));
vi.mock("@/lib/redistricting/fairnessApproval", () => ({
  getActiveFairnessGapModifiers: async () => new Map(),
}));
vi.mock("@/lib/internationalOrganizations/jointStatement", () => ({
  getActiveOrgStatementModifiersByCountry: async () => [],
}));
vi.mock("@/lib/api/headOfGovernmentReference", () => ({
  getHeadOfGovernmentReference: async () => null,
}));

import { snapshotApprovalHistory } from "./governmentApproval";
import { approvalDeltaUpdate } from "@/lib/approval/rules/adjustment";

function fixture() {
  const db = createInMemoryDb();
  db.seed(
    "states",
    ["TX", "CT"].map((_id) => ({ _id, countryId: "US", population: 100 }))
  );
  db.seed("gameState", [
    {
      _id: "current",
      currentTurn: 10,
      currentYear: 2029,
      startingYear: 2027,
      preset: "2027-default",
    },
  ]);
  db.seed("governmentApprovals", [
    {
      _id: "US",
      countryId: "US",
      approvalRating: 40,
      stateAverage: 40,
      history: [],
      warExhaustion: -1,
    },
  ]);
  db.seed(
    "stateApprovalHistory",
    ["TX", "CT"].map((_id) => ({
      _id,
      stateId: _id,
      countryId: "US",
      approvalRating: 40,
      history: [],
    }))
  );
  return db;
}

describe("atomic approval snapshots", () => {
  beforeEach(() => vi.clearAllMocks());
  it("does not repeat damping, history or exhaustion on the same turn", async () => {
    const db = fixture();
    await snapshotApprovalHistory(db as unknown as Db, "US", 11);
    const before = structuredClone([...db.collections].map(([name, col]) => [name, col.docs]));
    await snapshotApprovalHistory(db as unknown as Db, "US", 11);
    expect([...db.collections].map(([name, col]) => [name, col.docs])).toEqual(before);
    expect(
      db.collection("stateApprovalHistory").docs.every((doc) => doc.approvalRating === 42)
    ).toBe(true);
    expect(db.collection("governmentApprovals").docs[0].warExhaustion).toBe(-1.1);
  });
  it("rolls back an interruption between national and regional writes, then retries cleanly", async () => {
    const db = fixture();
    const regions = db.collection("stateApprovalHistory");
    const original = regions.bulkWrite.bind(regions);
    const fail = vi.spyOn(regions, "bulkWrite").mockRejectedValueOnce(new Error("interrupted"));
    await expect(snapshotApprovalHistory(db as unknown as Db, "US", 11)).rejects.toThrow(
      "interrupted"
    );
    expect(db.collection("governmentApprovals").docs[0].approvalRating).toBe(40);
    expect(db.collection("governmentApprovals").docs[0].lastSnapshotTurn).toBeUndefined();
    fail.mockImplementation(original);
    await snapshotApprovalHistory(db as unknown as Db, "US", 11);
    expect(db.collection("governmentApprovals").docs[0].lastSnapshotTurn).toBe(11);
    expect(regions.docs.every((doc) => doc.lastSnapshotTurn === 11)).toBe(true);
  });
  it("serializes competing country snapshots behind the same receipt", async () => {
    const db = fixture();
    await Promise.all([
      snapshotApprovalHistory(db as unknown as Db, "US", 11),
      snapshotApprovalHistory(db as unknown as Db, "US", 11),
    ]);
    expect(db.collection("governmentApprovals").docs[0].history).toHaveLength(1);
    for (const row of db.collection("stateApprovalHistory").docs)
      expect(row.history).toHaveLength(1);
  });
  it("does not let TX debt alter CT or national performance", async () => {
    const db = fixture();
    db.collection("stateApprovalHistory").docs.forEach((row) => {
      row.approvalRating = 70;
    });
    db.collection("governmentApprovals").docs[0].stateAverage = 70;
    await snapshotApprovalHistory(db as unknown as Db, "US", 11);
    expect(db.collection("governmentApprovals").docs[0].stateAverage).toBe(70);
    expect(
      db.collection("stateApprovalHistory").docs.find((row) => row._id === "TX")!.approvalRating
    ).toBe(68);
    expect(
      db.collection("stateApprovalHistory").docs.find((row) => row._id === "CT")!.approvalRating
    ).toBe(70);
  });
  it.each([
    [0, -7],
    [100, 7],
    [3, -7],
    [97, 7],
  ])("does not create approval by refunding a clamped change at %s", async (rating, delta) => {
    const db = fixture();
    const national = db.collection("governmentApprovals");
    national.docs[0].approvalRating = rating;
    await national.updateOne({ _id: "US" }, approvalDeltaUpdate(delta));
    expect(national.docs[0].approvalRating).toBe(Math.max(0, Math.min(100, rating + delta)));
    await national.updateOne({ _id: "US" }, approvalDeltaUpdate(-delta));
    expect(national.docs[0]).toMatchObject({
      approvalRating: rating,
      approvalRawRating: rating,
      approvalAdjustment: 0,
      disapprovalRating: 100 - rating,
      netApproval: 2 * rating - 100,
    });
  });
  it("retains direct decisions through later snapshots and updates derived totals", async () => {
    const db = fixture();
    await db.collection("governmentApprovals").updateOne({ _id: "US" }, approvalDeltaUpdate(-7));
    expect(db.collection("governmentApprovals").docs[0]).toMatchObject({
      approvalAdjustment: -7,
      approvalRating: 33,
      disapprovalRating: 67,
      netApproval: -34,
    });
    await snapshotApprovalHistory(db as unknown as Db, "US", 11);
    expect(db.collection("governmentApprovals").docs[0].approvalAdjustment).toBe(-7);
    expect(db.collection("governmentApprovals").docs[0].activeNationalModifiers).toContainEqual(
      expect.objectContaining({ id: "approval_events", effect: -7 })
    );
  });
});
