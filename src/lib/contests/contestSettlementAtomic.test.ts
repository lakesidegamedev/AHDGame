import { expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { settleContestRound } from "./engine";
import { awardReferralContest } from "./referralAward";
import { createNotification } from "@/lib/notifications";
import type { ContestRound } from "@/lib/db/types/contestRound";
import type { ContestWorld, PlayerCharacter } from "./standings";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => true }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn(async () => {}) }));
vi.mock("@/lib/achievements", () => ({ awardAchievement: vi.fn(async () => false) }));
function world() {
  const { db, memory } = createTransactionalMemoryDb();
  const character: PlayerCharacter = {
    _id: new ObjectId(),
    userId: new ObjectId(),
    name: "Contest Player",
    countryId: "CA",
    nationalInfluence: 10,
    favorability: 50,
  };
  const now = new Date("2026-11-01T00:00:00Z");
  memory.seed("gameState", [
    { _id: "current", currentTurn: 100, preset: "2027-default", forexEnabled: true },
  ]);
  memory.seed("exchangeRates", [{ _id: "CA", currencyCode: "CAD", rate: 1.4 }]);
  memory.seed("characters", [{ ...character, currencyBalances: { personal: { CAD: 100 } } }]);
  const round: ContestRound = {
    _id: "influence_gain:3",
    kind: "influence_gain",
    roundNumber: 3,
    status: "active",
    startedAt: new Date("2026-10-20T00:00:00Z"),
    endsAt: now,
    startTurn: 1,
    baselines: [
      { subjectId: character._id.toString(), characterId: character._id.toString(), value: 0 },
    ],
    standings: [],
    winners: [],
  };
  memory.seed("contestRounds", [round as unknown as Record<string, unknown>]);
  const scope: ContestWorld = {
    turn: 100,
    now,
    preset: "2027-default",
    iterationKey: "fixture",
    epochStartedAt: undefined,
    players: new Map([[character._id.toString(), character]]),
    playersByUser: new Map([[character.userId.toString(), character]]),
  };
  return { db, memory, scope, round, character };
}
it.each(["characters", "financialTxLog", "contestRounds"])(
  "keeps round closure and prize cash together after interrupted %s",
  async (collection) => {
    const { db, memory, scope, round } = world();
    const fault = withInjectedCrash(memory, {
      collection,
      op: collection === "financialTxLog" ? "insertOne" : "updateOne",
      onCall: collection === "contestRounds" ? 2 : 1,
      afterWrite: true,
    });
    Object.assign(fault.db, { client: db.client });
    await expect(settleContestRound(fault.db, scope, round)).rejects.toThrow();
    expect(memory.collection("contestRounds").docs[0].status).toBe("active");
    expect(memory.collection("characters").docs[0].currencyBalances).toEqual({
      personal: { CAD: 100 },
    });
    expect(memory.collection("financialTxLog").docs).toHaveLength(0);
    fault.disarm();
    await Promise.all([settleContestRound(db, scope, round), settleContestRound(db, scope, round)]);
    const accepted = structuredClone(memory.collection("characters").docs[0]);
    expect(
      Number((accepted.currencyBalances as { personal: Record<string, number> }).personal.CAD)
    ).toBeGreaterThan(100);
    expect(memory.collection("contestRounds").docs[0]).toMatchObject({
      status: "settled",
      winners: [expect.objectContaining({ paidAt: scope.now })],
    });
    await settleContestRound(db, scope, round);
    expect(memory.collection("characters").docs[0]).toEqual(accepted);
    expect(
      memory.collection("financialTxLog").docs.filter((row) => row.type === "contest_prize")
    ).toHaveLength(1);
  }
);
it("rolls back interrupted benefit revocation/grants and does not repeat the accepted award", async () => {
  const { db, memory, character, scope } = world();
  const previous = new ObjectId();
  memory.seed("users", [
    { _id: character.userId, username: "Synthetic winner" },
    { _id: previous, supporterProvider: "contest", patreonTier: "supporter" },
  ]);
  memory.seed("contestRounds", [
    {
      _id: "referrals_iteration:1",
      kind: "referrals_iteration",
      roundNumber: 1,
      status: "active",
      standings: [
        {
          subjectId: character.userId.toString(),
          characterId: character._id.toString(),
          characterName: character.name,
          score: 3,
        },
      ],
    },
  ]);
  const fault = withInjectedCrash(memory, {
    collection: "users",
    op: "updateOne",
    onCall: 1,
    afterWrite: true,
  });
  Object.assign(fault.db, { client: db.client });
  const input = {
    awardedBy: "system",
    now: scope.now,
    roundId: "referrals_iteration:1",
    turn: 100,
  };
  await expect(awardReferralContest(fault.db, input)).rejects.toThrow();
  expect(memory.collection("users").docs[1]).toMatchObject({
    supporterProvider: "contest",
    patreonTier: "supporter",
  });
  expect(memory.collection("users").docs[0].patreonTier).toBeUndefined();
  expect(
    memory.collection("contestRounds").docs.find((row) => row._id === "referrals_iteration:1")!
      .status
  ).toBe("active");
  fault.disarm();
  vi.mocked(createNotification).mockRejectedValueOnce(new Error("notification unavailable"));
  const awards = await Promise.all([
    awardReferralContest(db, input),
    awardReferralContest(db, input),
  ]);
  expect(awards[0]).toEqual(awards[1]);
  expect(memory.collection("users").docs[0]).toMatchObject({
    supporterProvider: "contest",
    patreonTier: "supporter",
  });
  expect(memory.collection("users").docs[1].patreonTier).toBeNull();
  expect(
    memory.collection("contestRounds").docs.find((row) => row._id === "referrals_iteration:1")!
      .status
  ).toBe("settled");
});
