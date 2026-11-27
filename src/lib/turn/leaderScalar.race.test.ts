import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { adjustPopularLegitimacy } from "./popularLegitimacy";
import { adjustLeaderConfidence } from "./rulingPartyConfidence";

const leader = new ObjectId();
function fixture() {
  const f = createTransactionalMemoryDb();
  f.memory.seed("countryLeaderStates", [
    {
      _id: `CN_${leader}`,
      countryId: "CN",
      leaderCharacterId: leader,
      partyConfidence: 75,
      popularLegitimacy: 75,
      confidenceHistory: [],
      popularLegitimacyHistory: [],
    },
  ]);
  return f;
}
describe("leader scalar concurrent publication", () => {
  it.each(["popular", "confidence"])(
    "retains overlapping %s deltas with an exact history chain",
    async (kind) => {
      const { db } = fixture();
      const adjust = kind === "popular" ? adjustPopularLegitimacy : adjustLeaderConfidence;
      const field = kind === "popular" ? "popularLegitimacy" : "partyConfidence";
      const history = kind === "popular" ? "popularLegitimacyHistory" : "confidenceHistory";
      await Promise.all(
        [-2, -3, 1, -4].map((delta, i) => adjust(db, "CN", leader, delta, `decision ${i}`, 100))
      );
      const row = await db.collection("countryLeaderStates").findOne({});
      expect(row?.[field]).toBe(67);
      const entries = row?.[history] as {
        previous: number;
        next: number;
        delta: number;
        reason: string;
      }[];
      expect(entries).toHaveLength(4);
      expect(new Set(entries.map((e) => e.reason)).size).toBe(4);
      for (let i = 0; i < entries.length - 1; i++)
        expect(entries[i].previous).toBe(entries[i + 1].next);
      expect(entries.reduce((sum, e) => sum + e.delta, 0)).toBe(-8);
    }
  );
  it("records clamped delivered changes and rejects nonfinite requests without mutation", async () => {
    const { db } = fixture();
    const a = await adjustPopularLegitimacy(db, "CN", leader, 100, "ceiling", 100);
    expect(a?.popularLegitimacyHistory?.[0].delta).toBe(25);
    const b = await adjustPopularLegitimacy(db, "CN", leader, 1, "at ceiling", 100);
    expect(b?.popularLegitimacyHistory?.[0].delta).toBe(0);
    await expect(adjustLeaderConfidence(db, "CN", leader, NaN, "bad input", 100)).rejects.toThrow(
      "Invalid"
    );
    expect((await db.collection("countryLeaderStates").findOne({}))?.partyConfidence).toBe(75);
  });
});
