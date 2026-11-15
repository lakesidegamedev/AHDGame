import { describe, expect, it, vi, beforeEach } from "vitest";
import { ObjectId, type Db } from "mongodb";

vi.mock("@/lib/news", () => ({ createSystemNewsPost: vi.fn().mockResolvedValue(undefined) }));

import { createSystemNewsPost } from "@/lib/news";
import {
  loadActiveLeaderLegacyShifts,
  loadLegacyApprovalPoints,
  recordLeaderDeparture,
} from "./leaderLegacy";

type Row = Record<string, unknown>;

const LEADER = new ObjectId();

function world(
  opts: { legacies?: Row[]; policies?: Row[]; crises?: Row[]; legacyEnabled?: boolean } = {}
) {
  const legacies: Row[] = opts.legacies ?? [];
  const crisisFind = vi.fn((_filter: Row) => ({ toArray: vi.fn(async () => opts.crises ?? []) }));
  const db = {
    collection: vi.fn((name: string) => {
      switch (name) {
        case "gameConfig":
          return {
            findOne: vi.fn(async () => ({ leaderLegacyEnabled: opts.legacyEnabled ?? true })),
          };
        case "leaderLegacies":
          return {
            findOne: vi.fn(
              async (filter: Row) => legacies.find((l) => l._id === filter._id) ?? null
            ),
            updateOne: vi.fn(async (filter: Row, update: { $setOnInsert: Row }) => {
              if (legacies.some((l) => l._id === filter._id)) return { upsertedCount: 0 };
              legacies.push(update.$setOnInsert);
              return { upsertedCount: 1 };
            }),
            find: vi.fn((filter: Row) => ({
              toArray: vi.fn(async () =>
                legacies.filter(
                  (l) =>
                    (filter.countryId as { $in: string[] }).$in.includes(l.countryId as string) &&
                    (l.endTurn as number) > ((filter.endTurn as { $gt: number }).$gt ?? 0)
                )
              ),
            })),
          };
        case "characters":
          return {
            findOne: vi.fn(async () => ({ _id: LEADER, name: "Ada Hart", party: "7" })),
          };
        case "statePolicies":
          return {
            find: vi.fn(() => ({ toArray: vi.fn(async () => opts.policies ?? []) })),
          };
        case "crises":
          return { find: crisisFind };
        default:
          throw new Error(`unexpected collection ${name}`);
      }
    }),
  } as unknown as Db;
  return { db, legacies, crisisFind };
}

const departure = {
  countryId: "US" as const,
  leaderKey: LEADER.toString(),
  sinceTurn: 100,
  nextKey: "someone-else",
  turn: 292,
  exitApproval: 62,
};

beforeEach(() => vi.clearAllMocks());

describe("recordLeaderDeparture", () => {
  it("records nothing on a world whose leader legacy switch is off", async () => {
    const w = world({ legacyEnabled: false });
    expect(await recordLeaderDeparture(w.db, departure)).toBeNull();
    expect(w.legacies).toHaveLength(0);
    expect(createSystemNewsPost).not.toHaveBeenCalled();
  });

  it("scores the term from approval and laws, stores it, and posts a news line", async () => {
    const policies = Array.from({ length: 12 }, (_, i) => ({
      _id: new ObjectId(),
      enactedByBillId: new ObjectId(`00000000000000000000000${(i % 6) + 1}`),
    }));
    const w = world({ policies });
    const doc = await recordLeaderDeparture(w.db, departure);

    expect(doc).not.toBeNull();
    // Six distinct bills, not twelve policy rows.
    expect(doc?.inputs.lawsEnacted).toBe(6);
    expect(doc?.partyId).toBe("7");
    expect(doc?.reason).toBe("term_end");
    expect(doc!.score).toBeGreaterThan(0);
    expect(doc!.votePct).toBeGreaterThan(0);
    expect(doc!.votePct).toBeLessThanOrEqual(2);
    expect(w.legacies).toHaveLength(1);
    expect(createSystemNewsPost).toHaveBeenCalledTimes(1);
  });

  it("is idempotent for the same departure", async () => {
    const w = world();
    await recordLeaderDeparture(w.db, departure);
    expect(await recordLeaderDeparture(w.db, departure)).toBeNull();
    expect(w.legacies).toHaveLength(1);
    expect(createSystemNewsPost).toHaveBeenCalledTimes(1);
  });

  it("marks an exit through an empty seat as a vacancy and skips the wire for a caretaker term", async () => {
    const w = world();
    const doc = await recordLeaderDeparture(w.db, {
      ...departure,
      sinceTurn: 285,
      nextKey: null,
      exitApproval: 30,
    });
    expect(doc?.reason).toBe("vacancy");
    expect(doc?.inputs.tenureTurns).toBe(7);
    expect(createSystemNewsPost).not.toHaveBeenCalled();
  });

  it("charges the leader's idle crisis turns and the scars of the term", async () => {
    const idle = Array.from({ length: 8 }, (_, i) => ({
      turn: 150 + i,
      stage: "peak",
      role: "headOfState",
      holderId: LEADER.toString(),
      leverId: null,
      cost: {},
      mitigation: 0,
      severity: 95,
    }));
    const scar = {
      ruleId: "r",
      kind: "regionalOutput",
      targetId: "US",
      magnitude: 0.1,
      createdTurn: 150,
      recoveryTurns: 200,
    };
    const calm = await recordLeaderDeparture(world().db, departure);
    const rough = await recordLeaderDeparture(
      world({ crises: [{ startTurn: 140, v2: { ledger: idle, scars: [scar] } }] }).db,
      departure
    );
    expect(rough!.inputs.crisisPoints).toBeLessThan(0);
    expect(rough!.inputs.scarMagnitude).toBeCloseTo(0.1, 5);
    expect(rough!.score).toBeLessThan(calm!.score);
  });
});

describe("legacy crisis read", () => {
  it("includes global crises as well as the country's own", async () => {
    const w = world();
    await recordLeaderDeparture(w.db, departure);
    expect(w.crisisFind).toHaveBeenCalled();
    expect(w.crisisFind.mock.calls[0]![0]).toMatchObject({
      $or: [{ countryIds: "US" }, { scope: "global" }],
    });
  });
});

describe("legacy readers", () => {
  const stored = (over: Row = {}): Row => ({
    _id: "US:a:1",
    countryId: "US",
    partyId: "7",
    votePct: 2,
    approvalPoints: 5,
    endTurn: 100,
    ...over,
  });

  it("gives election shifts that decay and vanish past the horizon", async () => {
    const w = world({ legacies: [stored()] });
    const now = await loadActiveLeaderLegacyShifts(w.db, "US", 100);
    expect(now).toEqual([expect.objectContaining({ partyId: "7", pct: 2, regionIds: [] })]);
    const later = await loadActiveLeaderLegacyShifts(w.db, "US", 196);
    expect(later[0].pct).toBeCloseTo(1, 5);
    expect(await loadActiveLeaderLegacyShifts(w.db, "US", 100 + 288)).toEqual([]);
  });

  it("skips a legacy with no party", async () => {
    const w = world({ legacies: [stored({ partyId: null })] });
    expect(await loadActiveLeaderLegacyShifts(w.db, "US", 100)).toEqual([]);
    expect((await loadLegacyApprovalPoints(w.db, ["US"], 100)).size).toBe(0);
  });

  it("gives the renewal phase decayed approval points keyed by country and party", async () => {
    const w = world({ legacies: [stored({ approvalPoints: -4 })] });
    const points = await loadLegacyApprovalPoints(w.db, ["US", "FR"], 196);
    expect(points.get("US|7")).toBeCloseTo(-2, 5);
    expect(points.has("FR|7")).toBe(false);
  });
});
