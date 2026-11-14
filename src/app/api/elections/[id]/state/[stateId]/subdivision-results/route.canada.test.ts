import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { NextRequest } from "next/server";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { getDb } from "@/lib/mongodb";
import { freezeCanadianRidingResult } from "@/lib/countries/ca/ridingResult";
import { GET } from "./route";

vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
const electionId = new ObjectId();
let memory: ReturnType<typeof createInMemoryDb>;
function call(region = "CA_ON") {
  return GET(new NextRequest("http://localhost/api/results"), {
    params: Promise.resolve({ id: String(electionId), stateId: region }),
  });
}
beforeEach(() => {
  memory = createInMemoryDb();
  vi.mocked(getDb).mockResolvedValue(memory as unknown as Db);
  memory.seed("gameState", [{ _id: "current", preset: "2027-default" }]);
  memory.seed("elections", [
    {
      _id: electionId,
      countryId: "CA",
      state: "CA_ON",
      electionType: "caCommons",
      status: "active",
      totalSeats: 122,
    },
  ]);
  memory.seed("electionVoteTallies", [
    {
      electionId,
      state: "CA_ON",
      totalVotes: { a: 1000, b: 900 },
      candidateNames: { a: "Candidate A", b: "Candidate B" },
      candidateParties: { a: "1", b: "2" },
      seatsEstimate: { a: 60, b: 62 },
    },
  ]);
  memory.seed("politicalParties", [
    {
      _id: new ObjectId(),
      countryId: "CA",
      sequentialId: 1,
      abbreviation: "LIB",
      color: "#ff0000",
      economicPosition: -10,
    },
    {
      _id: new ObjectId(),
      countryId: "CA",
      sequentialId: 2,
      abbreviation: "CON",
      color: "#0000ff",
      economicPosition: 20,
    },
  ]);
});

describe("Canadian federal riding result API", () => {
  it("renders actual Ontario geometry and preserves the recorded provincial allocation", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.subdivisions).toHaveLength(122);
    expect(data.subdivisions.filter((r: { winner: string }) => r.winner === "a")).toHaveLength(60);
    expect(data.subdivisions.filter((r: { winner: string }) => r.winner === "b")).toHaveLength(62);
    expect(data.notice).toContain("2023");
  });

  it("serves the immutable receipt after resolution even if party labels or live boosts change", async () => {
    const election = memory.collection("elections").docs[0],
      tally = memory.collection("electionVoteTallies").docs[0];
    const recorded = await freezeCanadianRidingResult({
      election: election as never,
      tally: tally as never,
      votes: tally.totalVotes as Record<string, number>,
      seats: tally.seatsEstimate as Record<string, number>,
      candidateParties: tally.candidateParties as Record<string, string>,
      parties: memory.collection("politicalParties").docs as never,
    });
    Object.assign(election, { status: "resolved" });
    tally.canadianRidingResult = recorded;
    const original = await (await call()).json();
    memory.collection("politicalParties").docs[0].abbreviation = "CHANGED";
    memory.collection("politicalParties").docs[0].color = "#ffffff";
    election.districtCampaignBoosts = { "35001": { "2": 7.5 } };
    tally.candidateNames = { a: "Changed" };
    expect(await (await call()).json()).toEqual(original);
    expect(original.resultStatus).toBe("frozen");
  });

  it("labels missing historical receipts and refuses country/state mismatches", async () => {
    memory.collection("elections").docs[0].status = "resolved";
    const unsupported = await (await call()).json();
    expect(unsupported.resultStatus).toBe("unsupported");
    expect(unsupported.notice).toContain("predates");
    expect((await call("CA")).status).toBe(400);
    expect((await call("CA_AB")).status).toBe(400);
  });
});
