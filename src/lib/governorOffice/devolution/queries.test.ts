import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

vi.mock("@/lib/utils/governmentApproval", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/utils/governmentApproval")>()),
  loadElectorateGroups: vi.fn().mockResolvedValue(new Map()),
  calculateStateApproval: vi.fn().mockReturnValue(50),
}));
vi.mock("@/lib/politicalLegislation/politicalApprovalProvider", () => ({
  loadPoliticalApprovalBases: vi.fn().mockResolvedValue(null),
}));

import {
  computeIndependenceDesireDriftForRegion,
  loadIndependenceDesireSnapshots,
} from "./queries";
import { loadPoliticalApprovalBases } from "@/lib/politicalLegislation/politicalApprovalProvider";

function cursorOf<T>(docs: T[]) {
  const cursor = {
    project: vi.fn(() => cursor),
    toArray: vi.fn().mockResolvedValue(docs),
  };
  return cursor;
}

const STATES = [
  { _id: "SCO", countryId: "UK" },
  { _id: "LON", countryId: "UK" },
  { _id: "CA_QC", countryId: "CA" },
  { _id: "CA_ON", countryId: "CA" },
];

function macro(id: string, desire?: number) {
  return {
    _id: id,
    economic: {},
    population: {},
    ...(desire == null ? {} : { independenceDesire: { value: desire, trend: 0 } }),
  };
}

function seedWorld(db: MockDb, states: typeof STATES) {
  db.collection("states").find.mockImplementation((query: { countryId: { $in: string[] } }) =>
    cursorOf(states.filter((s) => query.countryId.$in.includes(s.countryId)))
  );
  db.collection("macroMetrics").find.mockImplementation((query: { _id: { $in: string[] } }) =>
    cursorOf(
      query._id.$in.map((id) => macro(id, id === "SCO" ? 45 : id === "CA_QC" ? 35 : undefined))
    )
  );
  db.collection("gameState").findOne.mockResolvedValue(null);
  db.collection("governmentApprovals").findOne.mockImplementation(
    async (query: { _id: string }) => ({ _id: query._id, approvalRating: 50 })
  );
  db.collection("federalBudget").findOne.mockResolvedValue(null);
  db.collection("governorOfficeState").find.mockImplementation((query: { countryId: string }) =>
    cursorOf(
      query.countryId === "CA" ? [{ stateId: "CA_QC", devolutionPolicy: "independence" }] : []
    )
  );
}

describe("loadIndependenceDesireSnapshots", () => {
  let db: MockDb;
  beforeEach(() => {
    vi.clearAllMocks();
    db = createMockDb();
  });

  it("previews every seeded sovereignty region across countries", async () => {
    seedWorld(db, STATES);
    const rows = await loadIndependenceDesireSnapshots(db as unknown as Db);
    expect(rows.map((row) => row.stateId)).toEqual(["SCO", "CA_QC"]);
    const quebec = rows.find((row) => row.stateId === "CA_QC");
    expect(quebec).toMatchObject({ previous: 35, policy: "independence" });
    expect(quebec?.drivers.policy).toBeGreaterThan(0);
    expect(loadPoliticalApprovalBases).toHaveBeenCalledWith(expect.anything(), "CA");
  });

  it("skips a country with no seeded states without reading its data", async () => {
    seedWorld(
      db,
      STATES.filter((s) => s.countryId === "UK")
    );
    const rows = await loadIndependenceDesireSnapshots(db as unknown as Db);
    expect(rows.map((row) => row.stateId)).toEqual(["SCO"]);
    expect(loadPoliticalApprovalBases).toHaveBeenCalledTimes(1);
    expect(loadPoliticalApprovalBases).toHaveBeenCalledWith(expect.anything(), "UK");
  });

  it("reads only the region's own country for a single-region preview", async () => {
    seedWorld(db, STATES);
    const row = await computeIndependenceDesireDriftForRegion(db as unknown as Db, "ca_qc");
    expect(row?.previous).toBe(35);
    expect(loadPoliticalApprovalBases).toHaveBeenCalledTimes(1);
    expect(await computeIndependenceDesireDriftForRegion(db as unknown as Db, "CA_ON")).toBeNull();
  });
});
