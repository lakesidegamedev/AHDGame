import { expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { recordedCasinoResponse } from "./recordedResponse";
import {
  resolveCasinoPlayer,
  takeStake,
  settleHouseBet,
  houseLimits,
  CASINO_FUND_NAME,
} from "./house";
import { settleRound, cancelRound, type CasinoRound } from "./rounds";
import { startHighLow, actHighLow } from "./highlowSessions";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
function world() {
  const { db, memory } = createTransactionalMemoryDb();
  const characterId = new ObjectId(),
    userId = new ObjectId(),
    old = new ObjectId();
  const player = {
    characterId,
    characterName: "Synthetic player",
    discordId: "fixture-discord",
    countryId: "CA",
    currency: "CAD" as const,
    rate: 2,
  };
  memory.seed("gameState", [
    { _id: "current", currentTurn: 100, preset: "2027-default", forexEnabled: true },
  ]);
  memory.seed("users", [
    { _id: userId, discordId: player.discordId, activeCharacterId: characterId },
  ]);
  memory.seed("characters", [
    {
      _id: old,
      userId,
      name: "Archived",
      countryId: "US",
      currencyBalances: { personal: { USD: 1 } },
    },
    {
      _id: characterId,
      userId,
      name: player.characterName,
      countryId: "CA",
      currencyBalances: { personal: { CAD: 1000, USD: 200 }, savings: { CAD: 5000 } },
    },
  ]);
  memory.seed("exchangeRates", [
    { _id: "CA", currencyCode: "CAD", rate: 2 },
    { _id: "US", currencyCode: "USD", rate: 1 },
  ]);
  memory.seed("discordBotFunds", [
    { _id: new ObjectId(), name: CASINO_FUND_NAME, anchorBalance: 1000 },
  ]);
  const cash = () =>
    Number(
      (
        memory.collection("characters").docs[1].currencyBalances as {
          personal: Record<string, number>;
          savings: Record<string, number>;
        }
      ).personal.CAD
    );
  const house = () => Number(memory.collection("discordBotFunds").docs[0].anchorBalance);
  return { db, memory, player, cash, house };
}
it.each(["characters", "discordBotFunds", "financialTxLog"])(
  "keeps instant stakes and winnings paired after interrupted %s and replays a lost reply once",
  async (collection) => {
    const { db, memory, player, cash, house } = world();
    const run = (target = db) =>
      recordedCasinoResponse(target, "instant:fixture:one", { stake: 20 }, async (db) => {
        const limits = houseLimits(1000);
        expect((await takeStake(db, player, 20, limits)).ok).toBe(true);
        const result = await settleHouseBet(db, {
          player,
          game: "slots",
          stakeLocal: 20,
          multiplier: 2,
          limits,
          meta: { playId: "one" },
        });
        return NextResponse.json(result);
      });
    const fault = withInjectedCrash(memory, {
      collection,
      op: collection === "financialTxLog" ? "insertOne" : "updateOne",
      onCall: 1,
      afterWrite: true,
    });
    Object.assign(fault.db, { client: db.client });
    await expect(run(fault.db)).rejects.toThrow();
    expect(cash()).toBe(1000);
    expect(house()).toBe(1000);
    fault.disarm();
    const responses = await Promise.all([run(), run()]);
    expect(await responses[0].json()).toEqual(await responses[1].json());
    expect(cash()).toBe(1020);
    expect(house()).toBe(990);
    expect(cash() / 2 + house()).toBe(1500);
    const changed = await recordedCasinoResponse(
      db,
      "instant:fixture:one",
      { stake: 40 },
      async () => {
        throw new Error("must not rerun");
      }
    );
    expect(changed.status).toBe(409);
    expect(cash()).toBe(1020);
  }
);
it("settles a shared pot, house rake and payout receipt once despite interrupted payout and racing retries", async () => {
  const { db, memory, player, cash, house } = world();
  (
    memory.collection("characters").docs[1].currencyBalances as {
      personal: Record<string, number>;
      savings: Record<string, number>;
    }
  ).personal.CAD = 800;
  const second = {
    ...player,
    discordId: "second-player",
    characterId: new ObjectId(),
    characterName: "Second player",
  };
  memory.seed("characters", [
    { _id: second.characterId, currencyBalances: { personal: { CAD: 800 } } },
  ]);
  const now = new Date();
  const round: CasinoRound = {
    _id: new ObjectId(),
    game: "poker",
    status: "running",
    hostDiscordId: player.discordId,
    channelId: null,
    potAnchor: 200,
    startingChips: 1000,
    closesAt: now,
    expiresAt: now,
    createdAt: now,
    updatedAt: now,
    entries: [player, second].map((entry) => ({
      ...entry,
      stake: 200,
      anchorAmount: 100,
      enteredAt: now,
    })),
  };
  memory.seed("casinoRounds", [round as unknown as Record<string, unknown>]);
  const fault = withInjectedCrash(memory, {
    collection: "characters",
    op: "updateOne",
    onCall: 1,
    afterWrite: true,
  });
  Object.assign(fault.db, { client: db.client });
  const run = (target = db) =>
    settleRound(
      target,
      round._id.toString(),
      { chips: { [player.discordId]: 2000, [second.discordId]: 0 } },
      () => 0.5
    );
  await expect(run(fault.db)).rejects.toThrow();
  expect(cash()).toBe(800);
  expect(house()).toBe(1000);
  expect(memory.collection("casinoRounds").docs[0].status).toBe("running");
  fault.disarm();
  await Promise.all([run(), run()]);
  expect(cash()).toBe(1190);
  expect(house()).toBe(1005);
  expect(cash() / 2 + 800 / 2 + house()).toBe(2000);
  expect(memory.collection("casinoRounds").docs[0]).toMatchObject({
    status: "settled",
    payouts: [expect.objectContaining({ paid: true })],
  });
  expect((await cancelRound(db, round, "late retry")).ok).toBe(false);
  expect(cash()).toBe(1190);
});
it("preserves a pending high-low hand after interrupted cashout and pays racing cashouts once", async () => {
  const { db, memory, player, cash, house } = world();
  const opened = await startHighLow(db, player, 20, () => 0.4);
  expect(opened.ok).toBe(true);
  if (!opened.ok) return;
  const session = memory.collection("casinoHighLowSessions").docs[0];
  session.steps = 1;
  session.multiplier = 2;
  const fault = withInjectedCrash(memory, {
    collection: "characters",
    op: "updateOne",
    onCall: 1,
    afterWrite: true,
  });
  Object.assign(fault.db, { client: db.client });
  const run = (target = db) =>
    actHighLow(target, player.discordId, opened.session._id.toString(), "cashout");
  await expect(run(fault.db)).rejects.toThrow();
  expect(cash()).toBe(980);
  expect(house()).toBe(1000);
  expect(memory.collection("casinoHighLowSessions").docs[0].status).toBe("active");
  fault.disarm();
  await Promise.all([run(), run()]);
  expect(cash()).toBe(1020);
  expect(house()).toBe(990);
  expect(cash() / 2 + house()).toBe(1500);
});
it("resolves the active character instead of the first character on the account", async () => {
  const { db, player } = world();
  const result = await resolveCasinoPlayer(db, player.discordId);
  expect(result).toMatchObject({
    ok: true,
    player: { characterId: player.characterId, currency: "CAD" },
  });
});
