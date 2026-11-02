import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ObjectId, type Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { makeElection } from "@/lib/test-utils/factories";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/elections/electionParamResolution", () => ({
  resolveElectionRouteParam: vi.fn(),
}));

import { GET } from "./route";

let db: MockDb;

function returns(collection: string, docs: unknown[]) {
  const cursor = {
    sort: vi.fn().mockReturnThis(),
    project: vi.fn().mockReturnThis(),
    toArray: vi.fn().mockResolvedValue(docs),
  };
  db.collection(collection).find.mockReturnValue(cursor);
}

const call = (id: string) =>
  GET(new NextRequest(`http://t/api/elections/${id}/seat-history`), {
    params: Promise.resolve({ id }),
  });

const e1 = makeElection({
  seatId: "US-senate-MI-1",
  cycle: 1,
  electionYear: 1988,
  status: "completed",
});
const e2 = makeElection({
  seatId: "US-senate-MI-1",
  cycle: 2,
  electionYear: 1994,
  status: "active",
});

beforeEach(async () => {
  db = createMockDb();
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db as unknown as Db);
  const { resolveElectionRouteParam } = await import("@/lib/elections/electionParamResolution");
  vi.mocked(resolveElectionRouteParam).mockResolvedValue({ ok: true, election: e2 });
  returns("elections", [e1, e2]);
  returns("electionCandidates", [
    { _id: new ObjectId(), electionId: e1._id, characterName: "Don Riegle", party: "1" },
  ]);
  returns("electionVoteTallies", [
    {
      electionId: e1._id,
      totalVotes: { a: 600, b: 400 },
      candidateNames: { a: "Don Riegle", b: "Jim Dunn" },
      candidateParties: { a: "1", b: "2" },
      primaryResults: {
        byParty: {
          "1": [
            {
              candidateId: "a",
              characterName: "Don Riegle",
              party: "1",
              primaryScore: 1,
              sharePct: 70,
              won: true,
            },
            {
              candidateId: "c",
              characterName: "Al Roe",
              party: "1",
              primaryScore: 1,
              sharePct: 30,
              won: false,
            },
          ],
        },
      },
    },
  ]);
  returns("politicalParties", [
    { sequentialId: 1, name: "Democratic", abbreviation: "DEM", color: "#2563eb" },
    { sequentialId: 2, name: "Republican", abbreviation: "GOP", color: "#dc2626" },
  ]);
});

describe("GET /api/elections/[id]/seat-history", () => {
  it("lists every cycle of the seat newest first with winners", async () => {
    const res = await call("US-senate-MI-1");
    expect(res.status).toBe(200);
    const { cycles } = await res.json();
    expect(cycles.map((c: { cycle: number }) => c.cycle)).toEqual([2, 1]);
    expect(cycles[0].state).toBe("live");
    expect(cycles[1]).toMatchObject({
      electionId: e1._id.toHexString(),
      year: 1988,
      state: "final",
      winner: { name: "Don Riegle", partyAbbr: "DEM", partyColor: "#2563eb" },
      margin: 20,
      primaries: [{ partyId: "1", winnerName: "Don Riegle", margin: 40 }],
    });
  });

  it("finds a legacy seat's cycles by type, region and class when it has no seatId", async () => {
    const { resolveElectionRouteParam } = await import("@/lib/elections/electionParamResolution");
    const legacy = makeElection({
      seatId: undefined,
      state: "MI",
      electionType: "senate",
      senateClass: 1,
    });
    vi.mocked(resolveElectionRouteParam).mockResolvedValue({ ok: true, election: legacy });
    await call(legacy._id.toHexString());
    const query = db.collection("elections").find.mock.calls[0][0];
    expect(query).toMatchObject({ state: "MI", electionType: "senate", senateClass: 1 });

    const commons = makeElection({
      seatId: undefined,
      countryId: "UK",
      state: "LON",
      electionType: "commons",
    });
    vi.mocked(resolveElectionRouteParam).mockResolvedValue({ ok: true, election: commons });
    await call(commons._id.toHexString());
    expect(db.collection("elections").find.mock.calls[1][0]).toMatchObject({
      state: "LON",
      electionType: { $in: ["commons", "snap_commons"] },
    });
  });

  it("404s an unknown election", async () => {
    const { resolveElectionRouteParam } = await import("@/lib/elections/electionParamResolution");
    vi.mocked(resolveElectionRouteParam).mockResolvedValue({ ok: false, reason: "not_found" });
    expect((await call("US-senate-ZZ-1")).status).toBe(404);
  });

  it("issues one read per collection", async () => {
    await call("US-senate-MI-1");
    for (const name of [
      "elections",
      "electionCandidates",
      "electionVoteTallies",
      "politicalParties",
    ]) {
      expect(db.collection(name).find).toHaveBeenCalledTimes(1);
    }
  });
});
