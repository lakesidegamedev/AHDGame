import { it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import type { Character } from "@/lib/db/types";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { purchaseStandingAds } from "./standingCommands";
import { AD_ACTION_COST } from "./rules";
vi.mock("@/lib/time/gameTime", () => ({ getGameTime: async () => ({ currentTurn: 10 }) }));
vi.mock("./regions", () => ({
  assertStandingAdRegion: async () => [{ _id: "CA", name: "California" }],
}));
vi.mock("./adQuote", () => ({
  quoteAdAudience: async (
    _db: unknown,
    _country: unknown,
    _state: unknown,
    _policies: unknown,
    _ads: unknown,
    revision: number
  ) => ({
    currentTurn: 10,
    revision,
    forex: false,
    maxCount: 10,
    targets: [{ dimension: "race", bucket: "white", cost: 100, maxCount: 10 }],
  }),
}));
it("rolls back a landed manager-funded ad and rejects a competing stale quote without another charge", async () => {
  const f = createTransactionalMemoryDb();
  const owner = {
    _id: new ObjectId(),
    countryId: "US",
    actions: 100,
    funds: 1000,
    targetedAds: [],
    targetedAdsRevision: 0,
  } as unknown as Character;
  const payer = { ...owner, _id: new ObjectId() };
  f.memory.seed("characters", [{ ...owner }, { ...payer }]);
  const request = {
    stateId: "CA",
    dimension: "race" as const,
    bucket: "white",
    count: 1,
    quote: { turn: 10, cost: 100, revision: 0 },
  };
  const run = (db = f.db) => purchaseStandingAds(db, owner, payer, request);
  const crash = withInjectedCrash(f.memory, {
    collection: "characters",
    op: "updateOne",
    onCall: 1,
    afterWrite: true,
    matches: (args) => String((args[0] as { _id: unknown })._id) === String(owner._id),
  });
  await expect(run(crash.db)).rejects.toThrow();
  expect((await f.db.collection("characters").findOne({ _id: payer._id }))?.funds).toBe(1000);
  expect((await f.db.collection("characters").findOne({ _id: owner._id }))?.targetedAds).toEqual(
    []
  );
  const results = await Promise.allSettled([run(), run()]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const account = await f.db.collection("characters").findOne({ _id: payer._id });
  expect(account?.funds).toBe(900);
  expect(account?.actions).toBe(100 - AD_ACTION_COST);
  const effect = await f.db.collection("characters").findOne({ _id: owner._id });
  expect(effect?.targetedAdsRevision).toBe(1);
  expect(effect?.targetedAds).toHaveLength(1);
});
