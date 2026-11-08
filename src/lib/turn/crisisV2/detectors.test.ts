import { describe, expect, it, vi } from "vitest";
import { createDetectorProvider, DETECTOR_SOURCES, DETECTOR_STREAK_COLLECTION } from "./detectors";

interface Fake {
  enabled: boolean;
  streaks: { _id: string; detectorId: string; key: string; count: number; lastTurn: number }[];
  unemployment: Record<string, number>;
}

function makeDb(fake: Fake) {
  const bulkWrite = vi.fn(async () => ({}));
  const cursor = (rows: unknown[]) => ({ toArray: async () => rows });
  const db = {
    collection(name: string) {
      return {
        findOne: async () =>
          name === "gameConfig" ? { crisisV2EmergentEnabled: fake.enabled } : null,
        find() {
          if (name === "states") {
            return cursor([
              { _id: "tx", countryId: "US" },
              { _id: "oh", countryId: "US" },
            ]);
          }
          if (name === "macroMetrics") {
            return cursor(
              Object.entries(fake.unemployment).map(([id, value]) => ({
                _id: id,
                economic: { unemploymentRate: { value } },
              }))
            );
          }
          if (name === DETECTOR_STREAK_COLLECTION) return cursor(fake.streaks);
          return cursor([]);
        },
        bulkWrite: name === DETECTOR_STREAK_COLLECTION ? bulkWrite : vi.fn(),
      };
    },
  };
  return { db: db as never, bulkWrite };
}

const regionalJobs = DETECTOR_SOURCES.find((s) => s.spec.id === "detector-regional-jobs")!;
const provider = createDetectorProvider(regionalJobs);

describe("regional jobs detector", () => {
  it("proposes nothing while emergent crises are switched off", async () => {
    const { db, bulkWrite } = makeDb({
      enabled: false,
      streaks: [],
      unemployment: { tx: 15 },
    });
    expect(await provider.load({ db, turn: 20 })).toEqual([]);
    expect(bulkWrite).not.toHaveBeenCalled();
  });

  it("does not open on the first turn over the threshold, but starts the streak", async () => {
    const { db, bulkWrite } = makeDb({
      enabled: true,
      streaks: [],
      unemployment: { tx: 15, oh: 5 },
    });
    expect(await provider.load({ db, turn: 20 })).toEqual([]);
    const ops = bulkWrite.mock.calls[0][0] as { updateOne: { filter: { _id: string } } }[];
    expect(ops.map((op) => op.updateOne.filter._id)).toEqual(["detector-regional-jobs|tx"]);
  });

  it("opens once the run is long enough and names the region and its country", async () => {
    const { db } = makeDb({
      enabled: true,
      streaks: [
        {
          _id: "detector-regional-jobs|tx",
          detectorId: "detector-regional-jobs",
          key: "tx",
          count: 3,
          lastTurn: 19,
        },
      ],
      unemployment: { tx: 15, oh: 5 },
    });
    const candidates = await provider.load({ db, turn: 20 });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      definitionId: "emergent-regional-unemployment",
      scope: "state",
      countryIds: ["US"],
      regionIds: ["tx"],
    });
  });

  it("drops a streak when the region recovers", async () => {
    const { db, bulkWrite } = makeDb({
      enabled: true,
      streaks: [
        {
          _id: "detector-regional-jobs|tx",
          detectorId: "detector-regional-jobs",
          key: "tx",
          count: 3,
          lastTurn: 19,
        },
      ],
      unemployment: { tx: 6 },
    });
    expect(await provider.load({ db, turn: 20 })).toEqual([]);
    const ops = bulkWrite.mock.calls[0][0] as {
      deleteMany: { filter: { _id: { $in: string[] } } };
    }[];
    expect(ops[0].deleteMany.filter._id.$in).toEqual(["detector-regional-jobs|tx"]);
  });
});

describe("detector sources", () => {
  it("covers recession, banking panic, debt, regional jobs, energy and unrest with sustained runs", () => {
    expect(DETECTOR_SOURCES.map((s) => s.spec.definitionId).sort()).toEqual([
      "emergent-banking-panic",
      "emergent-debt-crisis",
      "emergent-energy-shortage",
      "emergent-recession",
      "emergent-regional-unemployment",
      "emergent-unrest-wave",
    ]);
    for (const { spec } of DETECTOR_SOURCES) expect(spec.sustainedTurns).toBeGreaterThanOrEqual(3);
  });
});
