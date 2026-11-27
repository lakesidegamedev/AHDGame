import { it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Character } from "@/lib/db/types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { foundCorporation } from "./foundCorporation";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => false }));
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/wireEvent", () => ({
  logWireEvent: vi.fn(),
  wireHeadlineCorpFounded: () => "Founded",
  wireHeadlineCorpIpo: () => "Listed",
}));
it.each(["corporations", "corporationCeoVotes"])(
  "rolls back a landed %s insert and retries founding once",
  async (collection) => {
    const f = createTransactionalMemoryDb();
    const character = {
      _id: new ObjectId(),
      name: "Synthetic founder",
      countryId: "US",
      homeState: "CA",
      cashOnHand: 1e9,
    } as Character;
    const userId = new ObjectId().toHexString();
    f.memory.seed("gameState", [
      { _id: "current", currentTurn: 200, currentYear: 2027, worldEpochId: "synthetic" },
    ]);
    f.memory.seed("characters", [{ ...character }]);
    f.memory.seed("states", [{ _id: "CA", id: "CA", countryId: "US", name: "California" }]);
    const request = {
      name: "Synthetic Works",
      tickerSymbol: "SYNW",
      type: "manufacturing" as const,
    };
    const fault = withInjectedCrash(f.memory, {
      collection,
      op: "insertOne",
      onCall: 1,
      afterWrite: true,
    });
    await expect(foundCorporation({ db: fault.db, character, userId, request })).rejects.toThrow();
    expect((await f.db.collection("characters").findOne({ _id: character._id }))!.cashOnHand).toBe(
      1e9
    );
    expect(await f.db.collection("corporations").countDocuments({})).toBe(0);
    const replies = await Promise.all([
      foundCorporation({ db: f.db, character, userId, request }),
      foundCorporation({ db: f.db, character, userId, request }),
    ]);
    expect(replies[0]).toMatchObject({ ok: true, status: 201 });
    expect(replies[1]).toEqual(replies[0]);
    const corps = await f.db.collection("corporations").find({}).toArray();
    expect(corps).toHaveLength(1);
    const founder = await f.db.collection("characters").findOne({ _id: character._id });
    expect(founder!.cashOnHand).toBeLessThan(1e9);
  }
);
