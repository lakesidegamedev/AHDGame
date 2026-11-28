import { it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Character, Union } from "@/lib/db/types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { organizeUnderground } from "./organizeUnderground";
import { UNDERGROUND_ACTION_COST } from "@/lib/unions/underground";
vi.mock("@/lib/labour/unionLaws", () => ({ isUnionsBanned: async () => true }));
it("rolls back action, organizer and union after a landed effect, then serializes competing drives", async () => {
  const f = createTransactionalMemoryDb();
  const character = {
    _id: new ObjectId(),
    countryId: "US",
    name: "Synthetic organizer",
    actions: 100,
  } as Character;
  const union = {
    _id: new ObjectId(),
    countryId: "US",
    sectorType: "manufacturing",
    treasury: 1000,
    approval: 70,
    strength: 200,
    suspended: true,
    undergroundStrength: 0,
    heat: 0,
  } as Union;
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 10 }]);
  f.memory.seed("characters", [{ ...character }]);
  f.memory.seed("unions", [{ ...union }]);
  const run = (db = f.db) => organizeUnderground(db, character, union, "quiet");
  const crash = withInjectedCrash(f.memory, {
    collection: "unions",
    op: "findOneAndUpdate",
    onCall: 1,
    afterWrite: true,
  });
  await expect(run(crash.db)).rejects.toThrow();
  expect((await f.db.collection("characters").findOne({ _id: character._id }))?.actions).toBe(100);
  expect(await f.db.collection("unionOrganizers").countDocuments({})).toBe(0);
  expect((await f.db.collection("unions").findOne({ _id: union._id }))?.undergroundStrength).toBe(
    0
  );
  const results = await Promise.all([run(), run()]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect((await f.db.collection("characters").findOne({ _id: character._id }))?.actions).toBe(
    100 - UNDERGROUND_ACTION_COST
  );
  expect(await f.db.collection("unionOrganizers").countDocuments({})).toBe(1);
});
