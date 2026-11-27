import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { createCharacterForAccount } from "./characterCreation";
import { createCharacterSchema } from "@/lib/api/schemas/settings";
import { gameConfig } from "@/lib/seeds/reference/gameConfig";
let activeDb: Db;
vi.mock("@/lib/mongodb", () => ({ getDb: async () => activeDb }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({})) }));
vi.mock("@/lib/auth/characterGateCookie", () => ({
  setCharacterGateCookie: vi.fn(async () => {}),
}));
vi.mock("@/lib/countryAccess", () => ({
  getCountryAccess: async () => ({ enabledForPlayers: true }),
}));
vi.mock("@/lib/time/gameTime", () => ({
  getGameTime: async () => ({ currentTurn: 100, effectiveNow: new Date("2026-11-01T00:00:00Z") }),
}));
vi.mock("@/lib/singleplayer", () => ({ isSingleplayer: () => false }));
vi.mock("@/lib/achievements", () => ({ awardAchievement: vi.fn(async () => true) }));
vi.mock("@/lib/mail/systemMail", () => ({ sendSystemMailOnce: vi.fn(async () => {}) }));
vi.mock("@/lib/analytics/intakeEvents", () => ({
  accountAgeBand: () => "existing",
  authProviderOf: () => "test",
  captureIntakeEvent: vi.fn(async () => {}),
}));
vi.mock("@/lib/analytics/characterActivation", () => ({
  rememberCharacterActivation: vi.fn(async () => {}),
}));
const input = createCharacterSchema.parse({
  name: "Synthetic Canadian",
  homeState: "ON",
  countryId: "CA",
  party: "independent",
  policies: { economic: 0, social: 0 },
  demographics: { race: "other", gender: "nonbinary", education: "college", wealth: "middle" },
});
function world() {
  const { db, memory } = createTransactionalMemoryDb();
  activeDb = db;
  const userId = new ObjectId(),
    referrer = new ObjectId(),
    old = new ObjectId(),
    current = new ObjectId();
  memory.seed("gameState", [
    { _id: "current", currentTurn: 100, preset: "2027-default", resetWorldId: "fixture-world" },
  ]);
  memory.seed("gameConfig", [
    {
      ...gameConfig,
      maintenanceMode: false,
      registrationEnabled: true,
      characterCreationEnabled: true,
      discordLinkRequiredForCharacter: false,
      referralContestStartedAt: new Date("2026-01-01T00:00:00Z"),
    },
  ]);
  memory.seed("users", [
    { _id: userId, username: "Synthetic new user", activeCharacterCount: 0, referredBy: referrer },
    { _id: referrer, username: "Synthetic referrer", activeCharacterId: current, referralCount: 0 },
  ]);
  memory.seed("characters", [
    {
      _id: old,
      userId: referrer,
      countryId: "CA",
      name: "Archived referrer",
      actions: 5,
      currencyBalances: { personal: { CAD: 100 } },
    },
    {
      _id: current,
      userId: referrer,
      countryId: "CA",
      name: "Active referrer",
      actions: 5,
      currencyBalances: { personal: { CAD: 100 } },
    },
  ]);
  memory.seed("states", [
    { _id: "ON", countryId: "CA", name: "Ontario", population: 1000000, gdp: 1000 },
  ]);
  memory.seed("exchangeRates", [
    { _id: "CA", currencyCode: "CAD", rate: 2, baseRate: 1.4 },
    { _id: "US", currencyCode: "USD", rate: 1, baseRate: 1 },
  ]);
  return { db, memory, userId, referrer, current };
}
beforeEach(() => vi.clearAllMocks());
it("pays the active referrer in the same frozen denomination basis as starting endowments", async () => {
  const { memory, userId, current } = world();
  const response = await createCharacterForAccount(userId.toString(), input);
  expect(response.status).toBe(201);
  const refs = memory.collection("characters").docs;
  expect(
    (
      refs[0].currencyBalances as {
        personal: Record<string, number>;
        savings: Record<string, number>;
      }
    ).personal.CAD
  ).toBe(100);
  expect(
    (
      refs[1].currencyBalances as {
        personal: Record<string, number>;
        savings: Record<string, number>;
      }
    ).personal.CAD
  ).toBe(700100);
  const reward = memory
    .collection("financialTxLog")
    .docs.find((row) => row.type === "referral_reward");
  expect(reward).toMatchObject({
    subjectId: current,
    currencyCode: "CAD",
    amount: 700000,
    anchorAmount: 350000,
  });
  expect(memory.collection("users").docs[1].referralCount).toBe(1);
});
it("rolls back creation, activation, endowments and referral counters after an interrupted reward and admits one racing retry", async () => {
  const { db, memory, userId } = world();
  const fault = withInjectedCrash(memory, {
    collection: "characters",
    op: "updateOne",
    onCall: 1,
    afterWrite: true,
  });
  Object.assign(fault.db, { client: db.client });
  activeDb = fault.db;
  await expect(createCharacterForAccount(userId.toString(), input)).rejects.toThrow();
  expect(memory.collection("characters").docs).toHaveLength(2);
  expect(
    (
      memory.collection("characters").docs[1].currencyBalances as {
        personal: Record<string, number>;
        savings: Record<string, number>;
      }
    ).personal.CAD
  ).toBe(100);
  expect(memory.collection("users").docs[0]).toMatchObject({ activeCharacterCount: 0 });
  expect(memory.collection("users").docs[0].activeCharacterId).toBeUndefined();
  expect(memory.collection("users").docs[1].referralCount).toBe(0);
  expect(memory.collection("financialTxLog").docs).toHaveLength(0);
  fault.disarm();
  activeDb = db;
  const replies = await Promise.all([
    createCharacterForAccount(userId.toString(), input),
    createCharacterForAccount(userId.toString(), input),
  ]);
  expect(replies.map((r) => r.status).sort()).toEqual([201, 409]);
  expect(memory.collection("characters").docs).toHaveLength(3);
  expect(memory.collection("users").docs[0].activeCharacterCount).toBe(1);
  expect(memory.collection("users").docs[1].referralCount).toBe(1);
  expect(
    (
      memory.collection("characters").docs[1].currencyBalances as {
        personal: Record<string, number>;
        savings: Record<string, number>;
      }
    ).personal.CAD
  ).toBe(700100);
});
