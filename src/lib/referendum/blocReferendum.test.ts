vi.mock("@/lib/db/sessionDb", () => ({
  boundSession: () => undefined,
  unboundDb: (db: unknown) => db,
  withSessionDb: (_db: unknown, work: (db: unknown) => Promise<unknown>) => work(_db),
  afterCommit: (_db: unknown, effect: () => Promise<unknown>) => effect(),
}));
vi.mock("@/lib/turn/currentTurn", () => ({ getCurrentTurn: vi.fn().mockResolvedValue(100) }));
vi.mock("@/lib/referendum/referendumWebhooks", () => ({
  announceReferendumRequested: vi.fn().mockResolvedValue(undefined),
  announceReferendumDecision: vi.fn().mockResolvedValue(undefined),
  announceReferendumVoteResult: vi.fn().mockResolvedValue(undefined),
  announceConsentBillResolved: vi.fn().mockResolvedValue(undefined),
  announceSecessionComplete: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/referendum/wire", () => ({ recordWireEvent: vi.fn().mockResolvedValue(undefined) }));

import { describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { makeStrictInMemoryStore } from "@/lib/test-utils/inMemoryStore";
import { requestReferendum } from "./requestReferendum";
import { loadBlocMembers, loadPooledDesire } from "./blocMembers";
import { referendumYesShare } from "./resolveYesShare";
import { poolCohorts } from "./rules/pooledElectorate";
import { buildReferendumCohorts } from "./cohortEngine";

const POP: Record<string, number> = {
  ME: 1_400_000,
  NH: 1_400_000,
  VT: 650_000,
  MA: 7_150_000,
  RI: 1_100_000,
  CT: 3_700_000,
};

function seed(desire: Record<string, number>) {
  return makeStrictInMemoryStore({
    states: Object.entries(POP).map(([_id, population]) => ({
      _id,
      countryId: "US",
      regionType: "state",
      population,
    })),
    macroMetrics: Object.entries(desire).map(([_id, value]) => ({
      _id,
      countryId: "US",
      independenceDesire: { value, trend: 0 },
    })),
    governorOfficeState: Object.keys(POP).map((stateId) => ({
      _id: `US_${stateId}`,
      countryId: "US",
      stateId,
      gubernatorialActions: 10,
    })),
    referendums: [],
  });
}

describe("bloc referendum request", () => {
  it("pools desire by population, so a small state's high mood cannot carry the bloc", async () => {
    const { db } = seed({ ME: 20, NH: 20, VT: 95, MA: 20, RI: 20, CT: 20 });
    expect(Math.round((await loadPooledDesire(db as unknown as Db, "NE_BLOC")) ?? 0)).toBe(23);
    const res = await requestReferendum(db as unknown as Db, { countryId: "US", stateId: "VT" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/60/);
  });

  it("opens one referendum for the bloc when the pooled desire reaches 60", async () => {
    const { db, cols } = seed({ ME: 60, NH: 60, VT: 60, MA: 65, RI: 60, CT: 60 });
    const res = await requestReferendum(db as unknown as Db, { countryId: "US", stateId: "ME" });
    expect(res.body.error).toBeUndefined();
    expect(res.status).toBe(200);
    expect(cols.referendums).toHaveLength(1);
    expect(cols.referendums[0]).toMatchObject({ regionId: "NE_BLOC", status: "requested" });
    expect(cols.referendums[0].yesShare).toBeGreaterThan(60);
    // Only the asking Governor's office paid.
    expect(cols.governorOfficeState.find((o) => o.stateId === "ME")?.gubernatorialActions).toBe(7);
    expect(cols.governorOfficeState.find((o) => o.stateId === "MA")?.gubernatorialActions).toBe(10);
  });

  it("refuses a second request from another member while one is in progress", async () => {
    const { db, cols } = seed({ ME: 70, NH: 70, VT: 70, MA: 70, RI: 70, CT: 70 });
    await requestReferendum(db as unknown as Db, { countryId: "US", stateId: "ME" });
    const second = await requestReferendum(db as unknown as Db, {
      countryId: "US",
      stateId: "CT",
    });
    expect(second.status).toBe(400);
    expect(second.body.error).toMatch(/already in progress/);
    expect(cols.referendums).toHaveLength(1);
  });
});

describe("bloc members", () => {
  it("lists a single region as a bloc of one", async () => {
    const { db } = makeStrictInMemoryStore({
      macroMetrics: [{ _id: "TX", countryId: "US", independenceDesire: { value: 41, trend: 0 } }],
    });
    expect(await loadBlocMembers(db as unknown as Db, "TX")).toEqual([
      { regionId: "TX", population: 0, desire: 41 },
    ]);
  });
});

describe("pooled vote", () => {
  const profile = [
    {
      dim: "age",
      buckets: [
        { id: "young", sharePct: 50, turnout: 60 },
        { id: "old", sharePct: 50, turnout: 60 },
      ],
    },
  ];

  it("is one turnout-weighted result across every member's electorate", () => {
    const members = Object.keys(POP).map((regionId) => ({
      regionId,
      population: POP[regionId],
      cohorts: buildReferendumCohorts(profile, regionId === "MA" ? 70 : 30, {}),
    }));
    const target = 46;
    const cohortBaseline = poolCohorts(members, target);
    const yes = referendumYesShare({
      cohortBaseline,
      cohortModifiers: [],
      campaignSpendUnits: { yes: 0, no: 0 },
      campaignBaseYesShare: target,
      yesShare: target,
    });
    expect(yes).toBeCloseTo(target, 2);
    // Campaigning in Vermont moves the pooled share less than the same push in Massachusetts.
    const push = (state: string) =>
      referendumYesShare({
        cohortBaseline,
        cohortModifiers: cohortBaseline
          .filter((c) => c.groupId.startsWith(`${state}:`))
          .map((c) => ({ groupId: c.groupId, turnoutMod: 0, leanMod: 10 })),
        campaignSpendUnits: { yes: 0, no: 0 },
        campaignBaseYesShare: target,
        yesShare: target,
      }) - yes;
    expect(push("MA")).toBeGreaterThan(push("VT") * 5);
  });
});
