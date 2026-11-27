import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { getDb } from "@/lib/mongodb";
import { executeStatePartyInfluence, executeNationalPartyInfluence } from "./partyExecutor";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
function setup() {
  const f = createTransactionalMemoryDb(),
    party = new ObjectId(),
    npp = new ObjectId(),
    actor = new ObjectId(),
    user = new ObjectId();
  f.memory.seed("gameState", [{ _id: "current", currentTurn: 100, isProcessing: false }]);
  f.memory.seed("politicalParties", [
    {
      _id: party,
      sequentialId: 1,
      countryId: "US",
      name: "Synthetic party",
      treasury: 5000,
      nppActionPoints: 1,
      chairId: actor,
    },
  ]);
  f.memory.seed("statePartyOrg", [
    {
      _id: "TX_1",
      stateId: "TX",
      partyId: "1",
      organization: 50,
      treasury: 5000,
      nppActionPoints: 1,
      chairId: actor,
    },
  ]);
  f.memory.seed("characters", [{ _id: actor, userId: user, countryId: "US" }]);
  f.memory.seed("users", [{ _id: user, isAdmin: true }]);
  f.memory.seed("npps", [
    {
      _id: npp,
      name: "Synthetic NPP",
      party: "1",
      countryId: "US",
      homeState: "TX",
      retiredAt: null,
      favorability: 50,
      politicalInfluence: 10,
      personality: { loyalty: 50, stubbornness: 50, ambition: 50 },
      influenceState: { totalTimesInfluenced: 0 },
    },
  ]);
  vi.mocked(getDb).mockResolvedValue(f.db);
  const input = {
    partyId: "1",
    partyObjectId: party,
    countryId: "US" as const,
    stateId: "TX",
    nppId: npp,
    influenceType: "boost_favorability" as const,
    fundAmount: 0,
    actorCharacterId: actor,
    context: {},
  };
  return { ...f, input };
}
for (const scope of ["state", "national"] as const) {
  const execute = scope === "state" ? executeStatePartyInfluence : executeNationalPartyInfluence,
    source = scope === "state" ? "statePartyOrg" : "politicalParties";
  it(`${scope} influence rolls back an interrupted target effect and spends once across overlapping retries`, async () => {
    const f = setup(),
      targets = f.memory.collection("npps"),
      write = targets.updateOne.bind(targets);
    let fail = true;
    vi.spyOn(targets, "updateOne").mockImplementation(async (...args) => {
      const result = await write(...args);
      if (
        fail &&
        (args[1] as { $set?: { favorability?: number } }).$set?.favorability !== undefined
      ) {
        fail = false;
        throw new Error("effect acknowledgement lost");
      }
      return result;
    });
    await expect(execute(f.input)).rejects.toThrow("effect acknowledgement lost");
    expect(f.memory.collection(source).docs[0]).toMatchObject({
      treasury: 5000,
      nppActionPoints: 1,
    });
    expect(targets.docs[0]).toMatchObject({
      favorability: 50,
      influenceState: { totalTimesInfluenced: 0 },
    });
    expect(f.memory.collection("nppInfluenceAttempts").docs).toHaveLength(0);
    const results = await Promise.all([execute(f.input), execute(f.input)]);
    expect(results.filter((r) => r.success)).toHaveLength(1);
    expect(f.memory.collection(source).docs[0]).toMatchObject({ treasury: 0, nppActionPoints: 0 });
    expect(Number(targets.docs[0].favorability)).toBeGreaterThan(50);
    expect(f.memory.collection("nppInfluenceAttempts").docs).toHaveLength(1);
  });
  it(`${scope} influence rolls back a partially inserted attempt receipt and preserves the turn fence`, async () => {
    const f = setup(),
      attempts = f.memory.collection("nppInfluenceAttempts"),
      write = attempts.insertOne.bind(attempts);
    vi.spyOn(attempts, "insertOne").mockImplementationOnce(async (...args) => {
      await write(...args);
      throw new Error("attempt receipt unavailable");
    });
    await expect(execute(f.input)).rejects.toThrow("attempt receipt unavailable");
    expect(f.memory.collection(source).docs[0]).toMatchObject({
      treasury: 5000,
      nppActionPoints: 1,
    });
    expect(f.memory.collection("npps").docs[0].favorability).toBe(50);
    await f.memory
      .collection("gameState")
      .updateOne({ _id: "current" }, { $set: { isProcessing: true } });
    expect((await execute(f.input)).success).toBe(false);
    expect(f.memory.collection(source).docs[0]).toMatchObject({
      treasury: 5000,
      nppActionPoints: 1,
    });
  });
}
