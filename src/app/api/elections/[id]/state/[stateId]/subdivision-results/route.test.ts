vi.mock("@/lib/counties/queries", () => ({
  loadCountyPopulationMap: vi.fn().mockResolvedValue(new Map()),
}));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/elections/electionParamResolution", () => ({
  resolveElectionRouteParam: vi.fn(),
}));
vi.mock("@/lib/maps/subdivisionData", () => ({ loadSubdivisionFile: vi.fn() }));
vi.mock("@/lib/db/collections/gameState", () => ({
  getGameStatePresetOrDefault: vi.fn().mockResolvedValue("2027"),
}));

const ELECTION = new ObjectId();
let tally: Record<string, unknown>;

beforeEach(async () => {
  vi.clearAllMocks();
  tally = {
    totalVotesByUnit: { OH: { a: 900, b: 100 } },
    totalVotes: { a: 900, b: 100 },
    candidateNames: { a: "A", b: "B" },
    candidateParties: {},
    unitTurnSnapshots: {
      OH: [
        { turn: 10, cumulativeVotes: { a: 100, b: 300 } },
        { turn: 11, cumulativeVotes: { a: 900, b: 100 } },
      ],
    },
  };
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue({
    collection: (name: string) =>
      name === "electionVoteTallies"
        ? { findOne: vi.fn().mockImplementation(async () => tally) }
        : { find: () => ({ toArray: async () => [] }) },
  } as never);
  const { loadSubdivisionFile } = await import("@/lib/maps/subdivisionData");
  vi.mocked(loadSubdivisionFile).mockResolvedValue({
    viewBox: "0 0 1 1",
    subdivisions: [{ id: "39001", name: "Adams", path: "M0 0", electorate: 100, leanScalar: 0 }],
  } as never);
});

async function call(status: string, query = "") {
  const { resolveElectionRouteParam } = await import("@/lib/elections/electionParamResolution");
  vi.mocked(resolveElectionRouteParam).mockResolvedValue({
    ok: true,
    election: { _id: ELECTION, electionType: "president", countryId: "US", status },
  } as never);
  const { GET } = await import("./route");
  return GET(new NextRequest(`http://t/api/elections/e/state/OH/subdivision-results${query}`), {
    params: Promise.resolve({ id: "e", stateId: "OH" }),
  });
}

describe("county results at a turn (race replay)", () => {
  it("serves a concluded race's counties as of an earlier week", async () => {
    const res = await call("resolved", "?turn=10");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subdivisions[0].winner).toBe("b");
  });

  it("refuses a past week of a live race", async () => {
    expect((await call("active", "?turn=10")).status).toBe(400);
  });

  it("rejects a malformed turn", async () => {
    expect((await call("resolved", "?turn=abc")).status).toBe(400);
  });

  it("serves the final counties without a turn", async () => {
    const body = await (await call("resolved")).json();
    expect(body.subdivisions[0].winner).toBe("a");
  });
  it("keeps concluded replay independent of today's population stocks", async () => {
    const { loadCountyPopulationMap } = await import("@/lib/counties/queries");
    const res = await call("resolved", "?turn=10");
    expect(res.status).toBe(200);
    expect(loadCountyPopulationMap).not.toHaveBeenCalled();
  });
  it("loads persisted populations for an active race", async () => {
    const { loadCountyPopulationMap } = await import("@/lib/counties/queries");
    const res = await call("active");
    expect(res.status).toBe(200);
    expect(loadCountyPopulationMap).toHaveBeenCalledWith(expect.anything(), "OH", "US");
  });
  it.each(["cancelled", "upcoming"])("refuses turn replay for a %s election", async (status) => {
    expect((await call(status, "?turn=10")).status).toBe(400);
  });
});

describe("UK and Japan persisted subdivision results", () => {
  it.each([
    ["UK", "commons", "LON", "Constituency"],
    ["JP", "shugiin", "KAN", "Prefecture"],
    ["JP", "sangiin", "KAN", "Prefecture"],
    ["JP", "governor", "KAN", "Prefecture"],
  ])("serves active %s %s map stocks", async (countryId, electionType, state, unitLabel) => {
    const { resolveElectionRouteParam } = await import("@/lib/elections/electionParamResolution");
    vi.mocked(resolveElectionRouteParam).mockResolvedValue({
      ok: true,
      election: { _id: ELECTION, electionType, countryId, status: "active" },
    } as never);
    tally.state = state;
    tally.seatsEstimate = { a: 1 };
    const { GET } = await import("./route");
    const response = await GET(
      new NextRequest("http://t/api/elections/e/state/x/subdivision-results"),
      { params: Promise.resolve({ id: "e", stateId: state }) }
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.unitLabel).toBe(unitLabel);
    expect(body.mode).toBe(countryId === "JP" ? "distributed" : "seatConsistent");
    const { loadCountyPopulationMap } = await import("@/lib/counties/queries");
    expect(loadCountyPopulationMap).toHaveBeenCalledWith(expect.anything(), state, countryId);
  });
});
