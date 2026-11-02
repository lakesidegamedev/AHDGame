import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn(async () => ({})) }));
vi.mock("@/lib/counties/queries", () => ({
  loadCountyPopulationMap: vi.fn(async () => new Map()),
}));
vi.mock("@/lib/db/collections/gameState", () => ({
  getGameStatePresetOrDefault: vi.fn().mockResolvedValue("1991-default"),
}));
vi.mock("@/lib/elections/electionParamResolution", () => ({ resolveElectionRouteParam: vi.fn() }));
vi.mock("@/lib/elections/resolveElection", () => ({ resolveElection: vi.fn() }));
vi.mock("@/lib/maps/subdivisionData", () => ({ loadSubdivisionFile: vi.fn() }));

import { GET } from "./route";

const cand = (id: string, party: string, share: number, econ: number, extra = {}) => ({
  id,
  characterName: id.toUpperCase(),
  party,
  partyName: `P${party}`,
  partyAbbr: party === "1" ? "DEM" : "REP",
  partyColor: party === "1" ? "#2563eb" : "#dc2626",
  partyEcon: party === "1" ? -2 : 2,
  economicPosition: econ,
  sharePct: share,
  ...extra,
});

async function call(electionType: string, inPrimary: boolean, query = "") {
  const { resolveElectionRouteParam } = await import("@/lib/elections/electionParamResolution");
  vi.mocked(resolveElectionRouteParam).mockResolvedValue({
    ok: true,
    election: { _id: "e", electionType, countryId: "US", status: "active" },
  } as never);
  const { resolveElection } = await import("@/lib/elections/resolveElection");
  vi.mocked(resolveElection).mockResolvedValue({
    inPrimary,
    candidates: [cand("d", "1", 0, -2), cand("r", "2", 0, 2)],
    polling: { sharesPct: { d: 55, r: 45 } },
    byParty: [
      {
        partyId: "1",
        partyColor: "#2563eb",
        candidates: [cand("lefty", "1", 60, -4), cand("mid", "1", 40, -1)],
      },
    ],
  } as never);
  return GET(new NextRequest(`http://t/api/elections/e/state/SD/projected-subdivisions${query}`), {
    params: Promise.resolve({ id: "e", stateId: "SD" }),
  });
}

beforeEach(async () => {
  const { loadSubdivisionFile } = await import("@/lib/maps/subdivisionData");
  vi.mocked(loadSubdivisionFile).mockResolvedValue({
    viewBox: "0 0 1 1",
    subdivisions: [
      { id: "left", name: "Left", path: "M0,0Z", electorate: 100, leanScalar: -20 },
      { id: "right", name: "Right", path: "M1,1Z", electorate: 100, leanScalar: 20 },
    ],
  } as never);
});

describe("GET projected-subdivisions", () => {
  it("projects a general's counties from its current shares", async () => {
    const res = await call("governor", false);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mode).toBe("projected");
    expect(body.subdivisions.find((s: { id: string }) => s.id === "left").winner).toBe("d");
    expect(body.subdivisions[0].path).toBe("M0,0Z");
    expect(body.candidateParties).toEqual({ d: "1", r: "2" });
    expect(body.partyColors).toEqual({ "1": "#2563eb", "2": "#dc2626" });
  });

  it("projects one party's primary with a colour per candidate", async () => {
    const body = await (await call("governor", true, "?party=1")).json();
    const byId = Object.fromEntries(
      body.subdivisions.map((s: { id: string; winner: string }) => [s.id, s.winner])
    );
    expect(byId).toEqual({ left: "lefty", right: "mid" });
    expect(body.candidateColors.lefty).toBe("#2563eb");
    expect(body.candidateColors.mid).not.toBe("#2563eb");
  });

  it("404s a primary party that is not in the race and a race type with no map", async () => {
    expect((await call("governor", true, "?party=9")).status).toBe(404);
    expect((await call("bundestag", false)).status).toBe(404);
  });
});

describe("GET projected-subdivisions for a finished primary", () => {
  it("draws a finished party primary from its stored result, losers included", async () => {
    const { resolveElectionRouteParam } = await import("@/lib/elections/electionParamResolution");
    vi.mocked(resolveElectionRouteParam).mockResolvedValue({
      ok: true,
      election: { _id: "e", electionType: "governor", countryId: "US", status: "resolved" },
    } as never);
    const { resolveElection } = await import("@/lib/elections/resolveElection");
    vi.mocked(resolveElection).mockResolvedValue({
      inPrimary: false,
      isEnded: true,
      candidates: [cand("lefty", "1", 0, -4), cand("r", "2", 0, 2)],
      polling: { sharesPct: { lefty: 55, r: 45 } },
      byParty: [{ partyId: "1", partyColor: "#2563eb", candidates: [cand("lefty", "1", 100, -4)] }],
      primaryResults: {
        "1": [
          { candidateId: "lefty", characterName: "Lefty", sharePct: 70, won: true },
          { candidateId: "gone", characterName: "Gone", sharePct: 30, won: false },
        ],
      },
    } as never);
    const res = await GET(
      new NextRequest(`http://t/api/elections/e/state/SD/projected-subdivisions?party=1`),
      { params: Promise.resolve({ id: "e", stateId: "SD" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.candidateNames).toEqual({ lefty: "Lefty", gone: "Gone" });
    expect(Object.keys(body.candidateColors)).toEqual(["lefty", "gone"]);
  });
});
