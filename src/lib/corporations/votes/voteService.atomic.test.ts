import { describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import type { CorporationVote } from "@/lib/db/types/corporationVote";
import { resolveCorporationVoteIfReady } from "./voteService";
import { captureServerGameEvent } from "@/lib/analytics/serverPosthog";
vi.mock("@/lib/analytics/serverPosthog", () => ({ captureServerGameEvent: vi.fn(async () => {}) }));
function setup() {
  const { db, memory } = createTransactionalMemoryDb();
  const corporationId = new ObjectId(),
    holder = new ObjectId();
  memory.seed("gameState", [{ _id: "current", currentTurn: 5 }]);
  memory.seed("corporations", [
    {
      _id: corporationId,
      countryId: "US",
      name: "Fixture",
      totalShares: 100,
      shareholders: [{ characterId: holder, shares: 100 }],
      legalStructure: "us_c_corp",
    },
  ]);
  const vote = {
    _id: new ObjectId(),
    corporationId,
    type: "governance_change",
    proposedByCharacterId: holder,
    proposedAtTurn: 5,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    status: "open",
    totalEligibleSharesAtOpen: 100,
    deadlineAtTurn: 10,
    passThreshold: 0.5,
    votes: [{ characterId: holder, vote: "yes", voteShares: 60, castAt: new Date(0) }],
    payload: { newLegalStructure: "us_llc" },
  } as CorporationVote;
  memory.seed("corporationVotes", [{ ...vote }]);
  return { db, memory, vote };
}
describe("vote decision and effects", () => {
  it("rolls back a landed governance effect and terminal status together, then retries once", async () => {
    const { memory, vote } = setup();
    const fault = withInjectedCrash(memory, {
      collection: "corporations",
      op: "updateOne",
      onCall: 1,
      afterWrite: true,
    });
    const run = () =>
      resolveCorporationVoteIfReady({
        db: fault.db,
        vote,
        totalEligibleShares: 100,
        currentTurn: 5,
      });
    await expect(run()).rejects.toThrow();
    expect(fault.crashed).toBe(true);
    expect(memory.collection("corporationVotes").docs[0].status).toBe("open");
    expect(memory.collection("corporations").docs[0].legalStructure).toBe("us_c_corp");
    expect(await run()).toEqual({ outcome: "passed", claimed: true });
    expect(memory.collection("corporations").docs[0].legalStructure).toBe("us_llc");
    expect(await run()).toEqual({ outcome: "passed", claimed: false });
  });
  it("keeps committed effects when optional telemetry fails", async () => {
    const { db, memory, vote } = setup();
    vi.mocked(captureServerGameEvent).mockRejectedValueOnce(new Error("telemetry unavailable"));
    expect(
      await resolveCorporationVoteIfReady({ db, vote, totalEligibleShares: 100, currentTurn: 5 })
    ).toEqual({ outcome: "passed", claimed: true });
    expect(memory.collection("corporations").docs[0].legalStructure).toBe("us_llc");
    expect(memory.collection("corporationVotes").docs[0].status).toBe("passed");
  });
  it("does not finalize an API poll during producer processing", async () => {
    const { db, memory, vote } = setup();
    memory.collection("gameState").docs[0].isProcessing = true;
    expect(
      await resolveCorporationVoteIfReady({ db, vote, totalEligibleShares: 100, currentTurn: 5 })
    ).toEqual({ outcome: "open", claimed: false });
    expect(memory.collection("corporationVotes").docs[0].status).toBe("open");
  });
});
