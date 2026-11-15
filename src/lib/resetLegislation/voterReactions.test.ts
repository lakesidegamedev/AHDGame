import { describe, expect, it } from "vitest";
import type { Db, ClientSession } from "mongodb";
import { createMockDb } from "@/lib/test-utils/mockDb";
import type { ResetLawProvision } from "@/lib/db/types/legislation";
import { applyV2VoterReactions } from "./voterReactions";
import { v2EnactmentApproval } from "./rules/voterReactions";
const char = "000000000000000000000001",
  npp = "000000000000000000000002";
const session = {} as ClientSession;
const provision = {
  familyId: "L01",
  choice: "far_left",
  currentChoiceSnapshot: "center",
} as ResetLawProvision;
describe("v2 voter reaction persistence", () => {
  it.each(["US", "UK", "JP"] as const)(
    "batches opposite reactions for %s with the enactment session",
    async (country) => {
      const db = createMockDb();
      await applyV2VoterReactions(
        db as unknown as Db,
        { votes: { [char]: "for", [`npp_${npp}`]: "against" } },
        country,
        [provision],
        new Map(),
        session
      );
      const positive = db.collectionMocks.characters!.bulkWrite.mock.calls[0]!;
      const negative = db.collectionMocks.npps!.bulkWrite.mock.calls[0]!;
      expect(db.collectionMocks.characters!.bulkWrite).toHaveBeenCalledTimes(1);
      expect(db.collectionMocks.npps!.bulkWrite).toHaveBeenCalledTimes(1);
      expect(positive[1]).toEqual({ session });
      expect(negative[1]).toEqual({ session });
      const plus = positive[0][0].updateOne,
        minus = negative[0][0].updateOne;
      expect(plus.filter._id.toString()).toBe(char);
      if (country !== "US") expect(plus.filter.countryId).toBe(country);
      // A new award must preserve any fractional balance left by prior decay.
      expect(JSON.stringify(plus.update)).not.toContain('"$round"');
      const impacts = v2EnactmentApproval([provision], country);
      for (const [bucket, amount] of Object.entries(impacts)) {
        const field = `bucketApprovals.${bucket}`;
        expect(plus.update[0].$set[field].$min[1].$max[1].$add[1]).toBe(amount);
        expect(minus.update[0].$set[field].$min[1].$max[1].$add[1]).toBe(-amount);
      }
    }
  );
  it("uses the actual preceding program, avoiding rewards for a stale draft", async () => {
    const db = createMockDb();
    await applyV2VoterReactions(
      db as unknown as Db,
      { votes: { [char]: "for" } },
      "UK",
      [provision],
      new Map([["L01", "far_left"]]),
      session
    );
    expect(db.collectionMocks.characters).toBeUndefined();
  });
  it("performs no writes for abstention or absent ballots", async () => {
    const db = createMockDb();
    await applyV2VoterReactions(
      db as unknown as Db,
      { votes: { [char]: "for" }, overrideVotes: { [char]: "abstain" } },
      "JP",
      [provision],
      new Map(),
      session
    );
    expect(db.collectionMocks.characters).toBeUndefined();
  });
});
