import type { Db } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const crises: unknown[] = [];
const tensions: { kind: string; delta: number }[] = [];
vi.mock("@/lib/crises/createCrisisFromTemplate", () => ({
  createCrisisFromTemplate: vi.fn(async (_db: unknown, params: unknown) => {
    crises.push(params);
    return "id";
  }),
}));
vi.mock("@/lib/coldwar/tension", () => ({
  applyTensionEvent: vi.fn(
    async (_d: unknown, _t: number, kind: string, _l: string, delta: number) => {
      tensions.push({ kind, delta });
    }
  ),
}));
const newsPosts: unknown[] = [];
vi.mock("@/lib/news", () => ({
  createSystemNewsPost: vi.fn(async (...args: unknown[]) => {
    newsPosts.push(args);
  }),
}));
vi.mock("./resilience", () => ({
  loadCyberResilience: vi.fn(async (_db: unknown, ids: string[]) =>
    ids.map((countryId) => ({ countryId, resilience: countryId === "US" ? 0.2 : 0.7 }))
  ),
}));

const activeCrisisCountries: string[] = [];
vi.mock("@/lib/db/repositories/crises", () => ({
  crisesCollection: () => ({
    find: () => ({
      toArray: async () => activeCrisisCountries.map((id) => ({ countryIds: [id] })),
    }),
  }),
}));

const switchState = { on: true };
vi.mock("@/lib/gameConfig/liveWorldSwitches", () => ({
  isLiveWorldSwitchOn: vi.fn(async () => switchState.on),
}));

const logRows: Record<string, unknown>[] = [];
const debit = vi.fn(async () => true);
const credit = vi.fn(async () => undefined);
vi.mock("@/lib/db/collections/intelligenceAppropriation", () => ({
  debitIntelligenceAppropriation: (...a: unknown[]) => debit(...(a as [])),
  creditIntelligenceAppropriation: (...a: unknown[]) => credit(...(a as [])),
}));
vi.mock("@/lib/db/collections/intelligence", () => ({
  getIntelligenceOpLogCollection: async () => ({
    find: () => ({ toArray: async () => logRows }),
    insertOne: async (row: Record<string, unknown>) => {
      // The unique launch key index.
      if (row.launchKey && logRows.some((r) => r.launchKey === row.launchKey))
        throw Object.assign(new Error("E11000 duplicate key"), { code: 11000 });
      logRows.push(row);
    },
  }),
}));

const db = {
  collection: () => ({ findOne: async () => ({ gdp: 1e12 }) }),
} as unknown as Db;

const { foldCyberPairHistory, launchCyberOperation, loadCyberCrisisTargets, standDownCyber } =
  await import("./runCyberOperation");

beforeEach(() => {
  crises.length = 0;
  activeCrisisCountries.length = 0;
  tensions.length = 0;
  newsPosts.length = 0;
  logRows.length = 0;
  debit.mockClear();
  credit.mockClear();
  switchState.on = true;
});

describe("cyber operations switch", () => {
  it("refuses a launch on a world that has not switched cyber operations on", async () => {
    switchState.on = false;
    const result = await launchCyberOperation({
      db,
      attackerId: "CN",
      targetId: "US",
      turn: 100,
      chargeAppropriation: true,
      rolls: { success: 0, attribution: 0 },
    });
    expect(result.ok).toBe(false);
    expect(debit).not.toHaveBeenCalled();
    expect(crises).toHaveLength(0);
    expect(logRows).toHaveLength(0);
  });
});

describe("launchCyberOperation", () => {
  it("a success opens an outage crisis on the target and a loud one exposes the sponsor", async () => {
    const result = await launchCyberOperation({
      db,
      attackerId: "CN",
      targetId: "US",
      turn: 10,
      chargeAppropriation: true,
      rolls: { success: 0, attribution: 0 },
    });
    expect(result).toMatchObject({ ok: true, outcome: "success", attributed: true });
    expect(debit).toHaveBeenCalledTimes(1);
    const targets = crises.map((c) => (c as { countryIds: string[] }).countryIds[0]);
    expect(targets).toEqual(["US", "CN"]);
    expect(tensions).toEqual([{ kind: "espionage", delta: expect.any(Number) }]);
    expect(logRows[0]).toMatchObject({
      domain: "cyber",
      outcome: "success",
      compromise: "attributed",
    });
  });

  it("a failed, unattributed operation changes nothing in the world but is logged", async () => {
    const result = await launchCyberOperation({
      db,
      attackerId: "CN",
      targetId: "US",
      turn: 10,
      chargeAppropriation: false,
      rolls: { success: 0.999, attribution: 0.999 },
    });
    expect(result).toMatchObject({ ok: true, outcome: "failed", attributed: false });
    expect(crises).toHaveLength(0);
    expect(tensions).toHaveLength(0);
    expect(debit).not.toHaveBeenCalled();
    expect(logRows).toHaveLength(1);
  });

  it("refuses a target that already has a cyber crisis, without charging or logging", async () => {
    activeCrisisCountries.push("US");
    const result = await launchCyberOperation({
      db,
      attackerId: "CN",
      targetId: "US",
      turn: 10,
      chargeAppropriation: true,
      rolls: { success: 0, attribution: 0 },
    });
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(debit).not.toHaveBeenCalled();
    expect(logRows).toHaveLength(0);
    expect(crises).toHaveLength(0);
  });

  it("reports only the requested countries that are under a cyber crisis", async () => {
    activeCrisisCountries.push("US", "FR");
    expect([...(await loadCyberCrisisTargets(db, ["US", "CN"]))]).toEqual(["US"]);
    expect((await loadCyberCrisisTargets(db, [])).size).toBe(0);
  });

  it("refuses within the cooldown without charging", async () => {
    await launchCyberOperation({
      db,
      attackerId: "CN",
      targetId: "US",
      turn: 10,
      chargeAppropriation: true,
      rolls: { success: 0.999, attribution: 0.999 },
    });
    debit.mockClear();
    const again = await launchCyberOperation({
      db,
      attackerId: "CN",
      targetId: "US",
      turn: 12,
      chargeAppropriation: true,
    });
    expect(again).toMatchObject({ ok: false, status: 409 });
    expect(debit).not.toHaveBeenCalled();
  });

  it("refunds the charge when the appropriation cannot cover it", async () => {
    debit.mockResolvedValueOnce(false);
    const result = await launchCyberOperation({
      db,
      attackerId: "CN",
      targetId: "US",
      turn: 10,
      chargeAppropriation: true,
    });
    expect(result).toMatchObject({ ok: false });
    expect(logRows).toHaveLength(0);
  });

  it("charges one of two launches sent at once and refunds the other", async () => {
    const launch = () =>
      launchCyberOperation({
        db,
        attackerId: "CN",
        targetId: "US",
        turn: 10,
        chargeAppropriation: true,
        rolls: { success: 0, attribution: 0.999 },
      });
    const results = await Promise.all([launch(), launch()]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ ok: false, status: 409 });
    expect(debit).toHaveBeenCalledTimes(2);
    expect(credit).toHaveBeenCalledTimes(1);
    expect(logRows).toHaveLength(1);
    expect(crises).toHaveLength(1);
  });
});

describe("standDownCyber", () => {
  it("refuses a country that never ran an operation against the target", async () => {
    expect(await standDownCyber(db, "US", "CN", 10)).toMatchObject({ ok: false, status: 409 });
    expect(tensions).toHaveLength(0);
    expect(logRows).toHaveLength(0);
  });

  it("opens a truce that blocks launches in both directions and relieves tension", async () => {
    await launchCyberOperation({
      db,
      attackerId: "CN",
      targetId: "US",
      turn: 9,
      chargeAppropriation: false,
      rolls: { success: 0.99, attribution: 0.99 },
    });
    const result = await standDownCyber(db, "CN", "US", 10);
    expect(result.ok).toBe(true);
    expect(tensions[0]).toMatchObject({ kind: "detente" });
    expect(tensions[0].delta).toBeLessThan(0);
    for (const [a, t] of [
      ["CN", "US"],
      ["US", "CN"],
    ] as const) {
      const blocked = await launchCyberOperation({
        db,
        attackerId: a,
        targetId: t,
        turn: 11,
        chargeAppropriation: false,
        rolls: { success: 0, attribution: 0 },
      });
      expect(blocked).toMatchObject({ ok: false, status: 409 });
    }
    expect(await standDownCyber(db, "CN", "US", 12)).toMatchObject({ ok: false });
  });
});

describe("foldCyberPairHistory truce shield", () => {
  const rows = [
    { ownerCountryId: "CN", targetCountryId: "US", opType: "cyber_operation", turn: 10 },
    {
      ownerCountryId: "CN",
      targetCountryId: "US",
      opType: "cyber_stand_down",
      turn: 11,
      truceUntilTurn: 83,
    },
  ] as never[];

  it("binds the declarer for the whole truce", () => {
    expect(foldCyberPairHistory(rows, "CN").truceUntilTurn).toBe(83);
  });

  it("frees the victim once the declarer's own cooldown would have lapsed", () => {
    expect(foldCyberPairHistory(rows, "US").truceUntilTurn).toBe(34);
  });
});

describe("public copy", () => {
  it("names countries rather than printing their ids", async () => {
    await launchCyberOperation({
      db,
      attackerId: "CN",
      targetId: "US",
      turn: 9,
      chargeAppropriation: false,
      rolls: { success: 0.99, attribution: 0.99 },
    });
    await standDownCyber(db, "CN", "US", 10);
    expect(JSON.stringify(newsPosts)).toContain("United States");
    expect(JSON.stringify(newsPosts)).not.toMatch(/against US\b/);
  });
});
