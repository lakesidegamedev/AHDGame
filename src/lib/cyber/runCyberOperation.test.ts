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
vi.mock("@/lib/news", () => ({ createSystemNewsPost: vi.fn(async () => undefined) }));
vi.mock("./resilience", () => ({
  loadCyberResilience: vi.fn(async (_db: unknown, ids: string[]) =>
    ids.map((countryId) => ({ countryId, resilience: countryId === "US" ? 0.2 : 0.7 }))
  ),
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
      logRows.push(row);
    },
  }),
}));

const db = {
  collection: () => ({ findOne: async () => ({ gdp: 1e12 }) }),
} as unknown as Db;

const { launchCyberOperation, standDownCyber } = await import("./runCyberOperation");

beforeEach(() => {
  crises.length = 0;
  tensions.length = 0;
  logRows.length = 0;
  debit.mockClear();
  credit.mockClear();
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
});

describe("standDownCyber", () => {
  it("opens a truce that blocks launches in both directions and relieves tension", async () => {
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
