import { beforeEach, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { createTransactionalMemoryDb } from "@/lib/test-utils/transactionalMemoryDb";
import { withInjectedCrash } from "@/lib/test-utils/faultyDb";
import { POST as recruit } from "@/app/api/country/[code]/executive/cabinet/[positionId]/military/recruit/route";
import { DELETE as disband } from "@/app/api/country/[code]/executive/cabinet/[positionId]/military/[unitId]/route";
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/api/requireAuth", () => ({
  requireAuth: async () => ({ ok: true, user: { isAdmin: true } }),
}));
const member = new ObjectId(),
  unitId = new ObjectId();
let f: ReturnType<typeof createTransactionalMemoryDb>;
beforeEach(() => {
  f = createTransactionalMemoryDb();
  f.memory.seed("gameState", [
    {
      _id: "current",
      currentTurn: 100,
      currentYear: 2019,
      preset: "2019-default",
      isProcessing: false,
    },
  ]);
  f.memory.seed("cabinetMembers", [
    { _id: member, countryId: "US", positionId: "secretary_of_defense", ministerialActions: 1 },
  ]);
  f.memory.seed("federalBudget", [
    {
      _id: "federal",
      countryId: "US",
      gdp: 387000000000,
      treasuryBalance: 10000000000,
      defenseAppropriation: { balance: 1000000000000, reserved: 0 },
    },
  ]);
  f.memory.seed("nationalManpower", [
    { _id: "US", countryId: "US", mode: "trained", pool: 100000 },
  ]);
  f.memory.seed("states", [{ _id: "TX", countryId: "US", population: 100000000 }]);
});
async function hire(db = f.db) {
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db);
  return recruit(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branchId: "army", type: "Infantry Division", name: "Test unit" }),
    }),
    { params: Promise.resolve({ code: "US", positionId: "secretary_of_defense" }) }
  );
}
async function dismiss(db = f.db) {
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(db);
  return disband(new Request("http://localhost", { method: "DELETE" }), {
    params: Promise.resolve({
      code: "US",
      positionId: "secretary_of_defense",
      unitId: unitId.toString(),
    }),
  });
}
it.each(["cabinetMembers", "nationalManpower", "federalBudget", "militaryUnits"])(
  "recruitment rolls back a landed %s resource write",
  async (collection) => {
    const fault = withInjectedCrash(f.memory, { collection, onCall: 1, afterWrite: true });
    expect((await hire(fault.db)).status).toBe(500);
    expect(fault.crashed).toBe(true);
    expect(f.memory.collection("cabinetMembers").docs[0].ministerialActions).toBe(1);
    expect(f.memory.collection("nationalManpower").docs[0].pool).toBe(100000);
    expect(f.memory.collection("federalBudget").docs[0].defenseAppropriation).toMatchObject({
      balance: 1000000000000,
    });
    expect(f.memory.collection("militaryUnits").docs).toHaveLength(0);
    expect((await hire(fault.db)).status).toBe(200);
    expect(f.memory.collection("militaryUnits").docs).toHaveLength(1);
    expect(f.memory.collection("federalBudget").docs[0].treasuryBalance).toBe(10000000000);
  }
);
it.each(["militaryUnits", "nationalManpower"])(
  "disbanding rolls back a landed %s write and returns personnel once",
  async (collection) => {
    f.memory.seed("militaryUnits", [{ _id: unitId, countryId: "US", personnel: 12000 }]);
    const fault = withInjectedCrash(f.memory, { collection, onCall: 1, afterWrite: true });
    expect((await dismiss(fault.db)).status).toBe(500);
    expect(fault.crashed).toBe(true);
    expect(f.memory.collection("militaryUnits").docs).toHaveLength(1);
    expect(f.memory.collection("nationalManpower").docs[0].pool).toBe(100000);
    expect((await dismiss(fault.db)).status).toBe(200);
    expect((await dismiss()).status).toBe(404);
    expect(f.memory.collection("nationalManpower").docs[0].pool).toBe(112000);
  }
);
