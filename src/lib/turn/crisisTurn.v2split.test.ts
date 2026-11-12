import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import type { Crisis } from "@/lib/db/types/crisis";
import { createCrisisInstance } from "@/lib/crises/v2/instance";
import { legacyDefinitionFor } from "./crisisV2/legacyContent";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/wireEvent", () => ({ logWireEvent: vi.fn().mockResolvedValue(undefined) }));

vi.mock("@/lib/livingConflict/processTurn", () => ({
  processLivingConflictsTurn: vi.fn().mockResolvedValue({ conflictsProcessed: 0, eventsOpened: 0 }),
}));
vi.mock("@/lib/livingConflict/vietnamCompat", async () => {
  const { emptyVietnamState } = await import("@/lib/crises/vietnamEscalation");
  return {
    retireLegacyVietnamCrises: vi.fn().mockResolvedValue(0),
    livingVietnamAsLegacyState: vi.fn().mockResolvedValue(emptyVietnamState()),
  };
});

let db: MockDb;

beforeEach(() => {
  db = createMockDb();
  ["crises", "states", "stateMetrics", "macroMetrics"].forEach((name) => db.collection(name));
  vi.clearAllMocks();
});

function crisis(overrides: Partial<Crisis> = {}): Crisis {
  return {
    _id: new ObjectId(),
    name: "Test Crisis",
    description: "desc",
    scope: "global",
    countryIds: [],
    regionIds: [],
    status: "active",
    startTurn: 5,
    endTurn: null,
    durationTurns: 3,
    effects: [
      {
        effectType: "tick",
        targetType: "metric",
        metricCategory: "economic",
        metricField: "unemploymentRate",
        sectorType: null,
        strategyId: null,
        value: 0.5,
        label: "Tick",
      },
    ],
    wireMessageOnStart: "Crisis begins",
    wireMessageOnEnd: "Crisis over",
    createdBy: null,
    createdAt: new Date(),
    resolvedAt: null,
    ...overrides,
  };
}

async function run(doc: Crisis, turn: number) {
  db.collectionMocks.crises.find.mockReturnValue({ toArray: async () => [doc] });
  db.collectionMocks.states.find.mockReturnValue({
    toArray: async () => [{ _id: "CA", countryId: "US" }],
  });
  const { processCrisisTurn } = await import("./crisisTurn");
  await processCrisisTurn(db as unknown as Db, turn);
}

describe("legacy documents and v2 documents in the crisis turn", () => {
  it("still applies effects to and expires a document without a v2 instance", async () => {
    await run(crisis(), 7);
    expect(db.collectionMocks.macroMetrics.updateMany).toHaveBeenCalledTimes(1);
    await run(crisis(), 8);
    expect(db.collectionMocks.crises.updateMany).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ $set: expect.objectContaining({ status: "resolved" }) })
    );
  });

  it("leaves a v2 document's effects and expiry to the v2 phase", async () => {
    const v2 = createCrisisInstance(legacyDefinitionFor("banking_crisis"), 5);
    await run(crisis({ v2 }), 8);
    expect(db.collectionMocks.macroMetrics.updateMany).not.toHaveBeenCalled();
    expect(db.collectionMocks.crises.updateMany).not.toHaveBeenCalled();
  });
});
