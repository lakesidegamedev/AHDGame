import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { SovereignCrisisDecision } from "@/lib/db/types/sovereignCrisisDecision";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { runNpcLegislatorAutoVote } from "../npc/npcLegislatorAutoVote";
import { loadChamberSeatWeights } from "./loadChamberSeatWeights";
import { tallyChamberOutcome } from "./tallyChamberOutcome";
import { POST } from "@/app/api/country/[code]/sovereign-resolution/vote/route";
import { requireAuthWithCharacter } from "@/lib/api/requireAuth";
import { getDb } from "@/lib/mongodb";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({ requireAuthWithCharacter: vi.fn() }));
function fixture() {
  const f = createTransactionalMemoryDb();
  const ids = [new ObjectId(), new ObjectId(), new ObjectId()];
  const decision = {
    _id: new ObjectId(),
    countryCode: "US",
    state: "executiveProposed",
    firedAtTurn: 1,
    currentChamberIndex: 0,
    executiveChoice: "bailout",
    legislativePhases: [
      {
        chamberKey: "house",
        outcome: "pending",
        votes: {},
        votesFor: 0,
        votesAgainst: 0,
        endsOnTurn: 100,
      },
    ],
  } as unknown as SovereignCrisisDecision;
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 5 }]);
  f.memory.seed("sovereignCrisisDecisions", [decision as unknown as Record<string, unknown>]);
  f.memory.seed(
    "npps",
    ids.map((id, i) => ({
      _id: id,
      countryId: "US",
      retiredAt: null,
      policies: { economic: i === 0 ? 5 : -5, social: 0 },
      personality: { loyalty: 50 },
    }))
  );
  f.memory.seed(
    "electedOfficials",
    ids.map((id, i) => ({
      _id: new ObjectId(),
      countryId: "US",
      officeType: "house",
      nppId: id,
      isNPP: true,
      seatsHeld: i === 0 ? 20 : 1,
    }))
  );
  vi.mocked(getDb).mockResolvedValue(f.db);
  return { ...f, ids, decision };
}
function phase(f: ReturnType<typeof fixture>) {
  return (
    f.memory.collection("sovereignCrisisDecisions").docs[0] as unknown as SovereignCrisisDecision
  ).legislativePhases![0];
}
beforeEach(() => vi.clearAllMocks());
describe("sovereign mandate weights", () => {
  it.each([false, true])(
    "recovers an interrupted ballot without adding its seats again, afterWrite=%s",
    async (afterWrite) => {
      const f = fixture();
      const fault = withInjectedCrash(f.memory, {
        collection: "sovereignCrisisDecisions",
        op: "updateOne",
        onCall: 1,
        afterWrite,
      });
      await expect(
        runNpcLegislatorAutoVote(fault.db, {
          decision: f.decision,
          chamberIndex: 0,
          countryCode: "US",
        })
      ).rejects.toThrow();
      await Promise.all(
        [1, 2].map(() =>
          runNpcLegislatorAutoVote(f.db, {
            decision: f.decision,
            chamberIndex: 0,
            countryCode: "US",
          })
        )
      );
      expect(phase(f)).toMatchObject({ votesFor: 20, votesAgainst: 2 });
      expect(tallyChamberOutcome(phase(f))).toBe("passed");
    }
  );
  it("does not write a ballot after the decision becomes terminal", async () => {
    const f = fixture();
    await f.memory
      .collection("sovereignCrisisDecisions")
      .updateOne({ _id: f.decision._id }, { $set: { state: "ratified" } });
    expect(
      (
        await runNpcLegislatorAutoVote(f.db, {
          decision: f.decision,
          chamberIndex: 0,
          countryCode: "US",
        })
      ).npcsVoted
    ).toBe(0);
    expect(phase(f).votesFor).toBe(0);
  });
  it("weights a human by canonical seats and refuses duplicate concurrent ballots", async () => {
    const f = fixture();
    const characterId = new ObjectId();
    await f.memory.collection("electedOfficials").insertOne({
      _id: new ObjectId(),
      countryId: "US",
      officeType: "house",
      characterId,
      seatsHeld: 12,
    });
    vi.mocked(requireAuthWithCharacter).mockResolvedValue({
      ok: true,
      user: {
        character: {
          _id: characterId,
          countryId: "US",
          currentOffice: { type: "house", seatsHeld: 999 },
        },
      },
    } as never);
    const responses = await Promise.all(
      [1, 2].map(() =>
        POST(
          new Request("http://localhost/api/country/us/sovereign-resolution/vote", {
            method: "POST",
            body: JSON.stringify({ vote: "for" }),
          }),
          { params: Promise.resolve({ code: "US" }) }
        )
      )
    );
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(phase(f).votesFor).toBe(12);
  });
  it("excludes other countries and chambers while summing split mandates", async () => {
    const f = fixture();
    await f.memory.collection("electedOfficials").insertMany([
      {
        _id: new ObjectId(),
        countryId: "US",
        officeType: "house",
        nppId: f.ids[0],
        isNPP: true,
        seatsHeld: 3,
      },
      {
        _id: new ObjectId(),
        countryId: "CA",
        officeType: "house",
        nppId: f.ids[0],
        isNPP: true,
        seatsHeld: 100,
      },
      {
        _id: new ObjectId(),
        countryId: "US",
        officeType: "senate",
        nppId: f.ids[0],
        isNPP: true,
        seatsHeld: 100,
      },
    ]);
    expect((await loadChamberSeatWeights(f.db, "US", "house")).get(f.ids[0].toString())).toBe(23);
  });
});
