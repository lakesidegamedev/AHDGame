import { POST as openEstate } from "@/app/api/country/[code]/executive/cabinet/[positionId]/estates/open/route";
import { POST as startInfra } from "@/app/api/country/[code]/executive/cabinet/[positionId]/infra/start/route";
import { POST as startDebt } from "@/app/api/country/[code]/executive/cabinet/[positionId]/debt-operation/route";
import { ESTATE_PORTFOLIO_BY_COUNTRY } from "@/lib/constants/cabinetEstates";
import { INFRA_POSITION_BY_COUNTRY } from "@/lib/constants/cabinetInfra";
import { resolveFinancePosition } from "@/lib/constants/cabinetMonetary";
import { describe, it, expect, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { getDb } from "@/lib/mongodb";
import { requireAuth, requireAuthWithCharacter } from "@/lib/api/requireAuth";
import { POST as build } from "@/app/api/country/[code]/executive/cabinet/[positionId]/energy/build/route";
import { POST as lobby } from "@/app/api/country/[code]/central-bank/lobby/route";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({
  requireAuth: vi.fn(),
  requireAuthWithCharacter: vi.fn(),
}));
vi.mock("@/lib/api/rateLimit", () => ({ checkRateLimit: () => ({ ok: true }) }));
vi.mock("@/lib/currency/featureFlag", () => ({ isForexEnabled: async () => false }));
function world() {
  const f = createTransactionalMemoryDb(),
    actor = new ObjectId(),
    target = new ObjectId(),
    userId = new ObjectId().toHexString();
  f.memory.seed("gameState", [
    { _id: "current", currentTurn: 5, worldEpochId: "paid-actions", preset: "2027-default" },
  ]);
  f.memory.seed("states", [{ _id: "ON", countryId: "CA" }]);
  f.memory.seed("characters", [
    { _id: actor, name: "Minister", countryId: "CA", cashOnHand: 1000 },
    { _id: target, name: "Nominee", countryId: "CA" },
  ]);
  f.memory.seed("cabinetMembers", [
    {
      _id: new ObjectId(),
      countryId: "CA",
      positionId: "minister_of_natural_resources",
      characterId: actor,
      ministerialActions: 2,
      status: "confirmed",
    },
  ]);
  f.memory.seed("centralBanks", [
    { _id: "CA", nominations: [{ characterId: target }], lobbyingPool: [] },
  ]);
  const auth = {
    ok: true,
    user: { userId, character: { _id: actor, countryId: "CA" }, isAdmin: false },
  };
  vi.mocked(requireAuth).mockResolvedValue(auth as never);
  vi.mocked(requireAuthWithCharacter).mockResolvedValue(auth as never);
  return { ...f, target };
}
function request(kind: "build" | "lobby", target: ObjectId, key = "same-intent") {
  return new Request("http://local/api/paid-command", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(
      kind === "build"
        ? { source: "coal", regionId: "ON", name: "Plant" }
        : { targetCharacterId: target.toHexString(), amount: 100 }
    ),
  });
}
describe("paid cabinet creation and central-bank lobbying", () => {
  it.each(["build", "lobby"] as const)(
    "rolls back a landed %s outcome and replays the original successful request",
    async (kind) => {
      const f = world(),
        call = () =>
          kind === "build"
            ? build(request(kind, f.target), {
                params: Promise.resolve({
                  code: "ca",
                  positionId: "minister_of_natural_resources",
                }),
              })
            : lobby(request(kind, f.target), { params: Promise.resolve({ code: "ca" }) });
      const fault = withInjectedCrash(f.memory, {
        collection: kind === "build" ? "energyPlants" : "centralBanks",
        op: kind === "build" ? "insertOne" : "updateOne",
        onCall: 1,
        afterWrite: true,
      });
      vi.mocked(getDb).mockResolvedValue(fault.db);
      expect((await call()).ok).toBe(false);
      expect(fault.crashed).toBe(true);
      expect(f.memory.collection("energyPlants").docs).toHaveLength(0);
      expect(f.memory.collection("characters").docs[0].cashOnHand).toBe(1000);
      expect(f.memory.collection("cabinetMembers").docs[0].ministerialActions).toBe(2);
      vi.mocked(getDb).mockResolvedValue(f.db);
      const responses = await Promise.all([call(), call()]);
      expect(responses.every((row) => row.ok)).toBe(true);
      await call();
      expect(f.memory.collection("energyPlants").docs).toHaveLength(kind === "build" ? 1 : 0);
      expect(f.memory.collection("characters").docs[0].cashOnHand).toBe(
        kind === "lobby" ? 900 : 1000
      );
      expect(f.memory.collection("cabinetMembers").docs[0].ministerialActions).toBe(
        kind === "build" ? 1 : 2
      );
      expect(f.memory.collection("centralBanks").docs[0].lobbyingPool).toHaveLength(
        kind === "lobby" ? 1 : 0
      );
    }
  );
  it("refuses turn processing and malformed intent keys before consuming actions", async () => {
    const f = world();
    vi.mocked(getDb).mockResolvedValue(f.db);
    f.memory.collection("gameState").docs[0].isProcessing = true;
    const call = (key: string) =>
      build(request("build", f.target, key), {
        params: Promise.resolve({ code: "ca", positionId: "minister_of_natural_resources" }),
      });
    expect((await call("turn-test")).status).toBe(409);
    f.memory.collection("gameState").docs[0].isProcessing = false;
    expect((await call("!invalid")).status).toBe(400);
    expect(f.memory.collection("cabinetMembers").docs[0].ministerialActions).toBe(2);
  });
});

it.each(["estate", "infrastructure", "debt"] as const)(
  "%s: restores ministerial actions after a landed outcome and serializes retries",
  async (kind) => {
    const f = world();
    const positionId =
      kind === "estate"
        ? Object.entries(ESTATE_PORTFOLIO_BY_COUNTRY.CA!).find(
            ([, portfolio]) => portfolio === "health"
          )![0]
        : kind === "infrastructure"
          ? INFRA_POSITION_BY_COUNTRY.CA!
          : resolveFinancePosition("CA")!;
    f.memory.collection("cabinetMembers").docs[0].positionId = positionId;
    const collection =
      kind === "estate"
        ? "cabinetEstates"
        : kind === "infrastructure"
          ? "infraProjects"
          : "treasuryOperations";
    const make = () =>
      new Request("http://local/api/paid-command", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": "same-asset-intent" },
        body: JSON.stringify(
          kind === "estate"
            ? { archetypeId: "hospital", siteId: "ON", name: "Hospital" }
            : { archetypeId: "highway", regionId: "ON", name: "Highway" }
        ),
      });
    const invoke = () =>
      (kind === "estate" ? openEstate : kind === "infrastructure" ? startInfra : startDebt)(
        make(),
        { params: Promise.resolve({ code: "ca", positionId }) }
      );
    const crash = withInjectedCrash(f.memory, {
      collection,
      op: kind === "debt" ? "updateOne" : "insertOne",
      onCall: 1,
      afterWrite: true,
    });
    vi.mocked(getDb).mockResolvedValue(crash.db);
    expect((await invoke()).status).toBeGreaterThanOrEqual(500);
    expect(f.memory.collection("cabinetMembers").docs[0].ministerialActions).toBe(2);
    expect(f.memory.collection(collection).docs).toHaveLength(0);
    vi.mocked(getDb).mockResolvedValue(f.db);
    const results = await Promise.all([invoke(), invoke()]);
    expect(results.filter((r) => r.ok)).toHaveLength(kind === "debt" ? 1 : 2);
    expect(f.memory.collection("cabinetMembers").docs[0].ministerialActions).toBe(1);
    expect(f.memory.collection(collection).docs).toHaveLength(1);
  }
);
