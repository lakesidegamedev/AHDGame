import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCrisisInstance } from "@/lib/crises/v2/instance";
import { makeDefinition } from "@/lib/crises/v2/testFixtures";
import type { CrisisInstance } from "@/lib/crises/v2/types";
import {
  registerCrisisDefinition,
  resetCrisisV2RegistryForTests,
} from "@/lib/turn/crisisV2/registry";

const spendFromTreasury = vi.hoisted(() => vi.fn());
const creditTreasury = vi.hoisted(() => vi.fn());
const debitCorp = vi.hoisted(() => vi.fn());
const refundCorp = vi.hoisted(() => vi.fn());
const roles = vi.hoisted(() => ({ derived: [] as string[] }));
const rates = vi.hoisted(() => ({ current: {} as Record<string, number> }));

vi.mock("@/lib/budget/treasurySpend", () => ({ spendFromTreasury, creditTreasury }));
vi.mock("@/lib/financialTxLog/atomicCashGuard", () => ({
  atomicallyDebitCorpLiquidCapital: debitCorp,
  refundCorpLiquidCapital: refundCorp,
}));
vi.mock("@/lib/campaigns/campaignCurrency", async () => {
  const actual = await vi.importActual<typeof import("@/lib/campaigns/rules/currency")>(
    "@/lib/campaigns/rules/currency"
  );
  return {
    campaignAnchorToLocal: actual.campaignAnchorToLocal,
    loadCampaignCurrencyRates: async () => rates.current,
  };
});
vi.mock("@/lib/era/context", () => ({ getEraContext: async () => ({ preset: null }) }));
vi.mock("@/lib/gameState", () => ({ getGameState: async () => ({ currentTurn: 10 }) }));
vi.mock("@/lib/crises/interactionEngine", () => ({
  resolveCharacterRoles: async () => roles.derived,
}));
vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));

import { pullLever } from "./leverCommand";

const characterId = new ObjectId();
const crisisId = new ObjectId();

interface Store {
  uses: Record<string, unknown>[];
  approvals: { id: string; delta: number }[];
  instance: CrisisInstance;
  character: Record<string, unknown> | null;
  corporation: Record<string, unknown> | null;
  congressLeader: boolean;
  actions: number;
  regionIds?: string[];
}

function makeDb(store: Store) {
  const sameSlot = (a: Record<string, unknown>, b: Record<string, unknown>) =>
    ["crisisId", "leverId", "holderId", "submittedTurn"].every(
      (k) => String(a[k]) === String(b[k])
    );
  return {
    collection(name: string) {
      if (name === "crises") {
        return {
          findOne: async () => ({
            _id: crisisId,
            scope: "country",
            countryIds: ["US"],
            regionIds: store.regionIds ?? [],
            v2: store.instance,
          }),
        };
      }
      if (name === "characters") {
        return {
          findOne: async () => store.character,
          updateOne: async (
            filter: { actions?: { $gte: number } },
            update: { $inc: { actions: number } }
          ) => {
            const needed = filter.actions?.$gte ?? 0;
            if (store.actions < needed) return { modifiedCount: 0 };
            store.actions += update.$inc.actions;
            return { modifiedCount: 1 };
          },
        };
      }
      if (name === "corporations") return { findOne: async () => store.corporation };
      if (name === "congressLeaders") {
        return { findOne: async () => (store.congressLeader ? { _id: new ObjectId() } : null) };
      }
      if (name === "governmentApprovals") {
        return {
          updateOne: async (
            filter: { _id: string },
            update: { $inc: { approvalRating: number } }
          ) => {
            store.approvals.push({ id: filter._id, delta: update.$inc.approvalRating });
          },
        };
      }
      if (name === "crisisLeverUses") {
        return {
          insertOne: async (row: Record<string, unknown>) => {
            if (store.uses.some((existing) => sameSlot(existing, row))) {
              throw Object.assign(new Error("dup"), { code: 11000 });
            }
            store.uses.push({ ...row });
          },
          deleteOne: async (filter: { _id: ObjectId }) => {
            store.uses = store.uses.filter((row) => String(row._id) !== String(filter._id));
          },
          updateOne: async (
            filter: { _id: ObjectId },
            update: { $set: Record<string, unknown> }
          ) => {
            const row = store.uses.find((r) => String(r._id) === String(filter._id));
            if (row) Object.assign(row, update.$set);
          },
          find: (filter: { leverId?: string; holderId?: string }) => ({
            sort: () => ({
              limit: () => ({
                toArray: async () =>
                  store.uses
                    .filter((r) => r.leverId === filter.leverId && r.holderId === filter.holderId)
                    .sort((a, b) => (b.submittedTurn as number) - (a.submittedTurn as number))
                    .slice(0, 1),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected collection ${name}`);
    },
  } as never;
}

function freshStore(overrides: Partial<Store> = {}): Store {
  return {
    uses: [],
    approvals: [],
    instance: {
      ...createCrisisInstance(makeDefinition(), 0),
      stage: "onset",
      stageStartTurn: 1,
      severity: 40,
    },
    character: { _id: characterId, countryId: "US", currentOffice: { type: "president" } },
    corporation: null,
    congressLeader: false,
    actions: 10,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  rates.current = {};
  roles.derived = ["any", "headOfState"];
  spendFromTreasury.mockResolvedValue({});
  creditTreasury.mockResolvedValue({});
  debitCorp.mockResolvedValue({ ok: true, newBalance: 0 });
  resetCrisisV2RegistryForTests();
  registerCrisisDefinition(makeDefinition());
});

const pull = (store: Store, leverId = "stimulus", extra = {}) =>
  pullLever(makeDb(store), { crisisId, leverId, characterId, ...extra });

describe("pullLever", () => {
  it("charges treasury and approval once, then releases the row", async () => {
    const store = freshStore();
    const result = await pull(store);
    expect(result).toMatchObject({ ok: true, cost: { treasuryCash: 1000 } });
    expect(spendFromTreasury).toHaveBeenCalledTimes(1);
    expect(spendFromTreasury).toHaveBeenCalledWith(
      expect.anything(),
      "US",
      1000,
      expect.objectContaining({
        witness: expect.objectContaining({
          flow: "crisis_response",
          key: `crisis-lever:${crisisId.toString()}:stimulus:${characterId.toString()}:10`,
        }),
      })
    );
    expect(store.approvals).toEqual([{ id: "US", delta: -2 }]);
    expect(store.uses).toHaveLength(1);
    expect(store.uses[0]).toMatchObject({
      chargeState: "charged",
      appliedTurn: null,
      submittedTurn: 10,
    });
  });

  it("charges only once when the same pull is submitted twice", async () => {
    const store = freshStore();
    const [a, b] = await Promise.all([pull(store), pull(store)]);
    const outcomes = [a, b].map((r) => (r.ok ? "ok" : r.code)).sort();
    expect(outcomes[1]).toBe("ok");
    expect(["cooldown", "duplicate"]).toContain(outcomes[0]);
    expect(spendFromTreasury).toHaveBeenCalledTimes(1);
    expect(store.approvals).toHaveLength(1);
    expect(store.uses).toHaveLength(1);
  });

  it("rejects the second submit at the claim when the first is still in flight", async () => {
    const store = freshStore();
    const result = await pull(store);
    expect(result.ok).toBe(true);
    // a second client that never saw the first row, e.g. a stale read
    const again = await pullLever(makeDb(freshStore({ uses: store.uses })), {
      crisisId,
      leverId: "stimulus",
      characterId,
    });
    expect(again).toMatchObject({ ok: false });
    expect(spendFromTreasury).toHaveBeenCalledTimes(1);
  });

  it("refunds and frees the slot when a later charge fails", async () => {
    debitCorp.mockResolvedValueOnce({ ok: false, error: "Insufficient" });
    registerCrisisDefinition(
      makeDefinition({
        levers: [
          {
            id: "bailout",
            role: "corpCeo",
            label: "Bailout",
            mitigation: 5,
            cost: { treasuryCash: 500, corpCash: 200, approval: { group: "x", points: 1 } },
          },
        ],
      })
    );
    roles.derived = ["any"];
    const store = freshStore({ corporation: { _id: new ObjectId(), countryId: "US" } });
    const result = await pull(store, "bailout", { corporationId: new ObjectId() });
    expect(result).toMatchObject({ ok: false, code: "insufficient_funds" });
    expect(creditTreasury).toHaveBeenCalledWith(expect.anything(), "US", 500, expect.anything());
    expect(store.uses).toHaveLength(0);
    expect(store.approvals).toEqual([]);
  });

  it("refunds everything taken when the release write throws", async () => {
    const store = freshStore();
    const db = makeDb(store) as unknown as { collection: (n: string) => Record<string, unknown> };
    const base = db.collection.bind(db);
    db.collection = (name: string) => {
      const c = base(name);
      if (name === "crisisLeverUses") {
        return {
          ...c,
          updateOne: async () => {
            throw new Error("boom");
          },
        };
      }
      return c;
    };
    const result = await pullLever(db as never, { crisisId, leverId: "stimulus", characterId });
    expect(result).toMatchObject({ ok: false, code: "charge_failed" });
    expect(creditTreasury).toHaveBeenCalledTimes(1);
    expect(store.approvals).toEqual([
      { id: "US", delta: -2 },
      { id: "US", delta: 2 },
    ]);
    expect(store.uses).toHaveLength(0);
  });

  it("refunds the treasury and actions when the approval charge throws", async () => {
    const store = freshStore();
    const db = makeDb(store) as unknown as { collection: (n: string) => Record<string, unknown> };
    const base = db.collection.bind(db);
    db.collection = (name: string) => {
      const c = base(name);
      if (name === "governmentApprovals") {
        return {
          ...c,
          updateOne: async () => {
            throw new Error("approval write failed");
          },
        };
      }
      return c;
    };
    const actionsBefore = store.actions;
    const result = await pullLever(db as never, { crisisId, leverId: "stimulus", characterId });
    expect(result).toMatchObject({ ok: false, code: "charge_failed" });
    expect(spendFromTreasury).toHaveBeenCalledTimes(1);
    expect(creditTreasury).toHaveBeenCalledTimes(1);
    expect(creditTreasury.mock.calls[0][2]).toBe(spendFromTreasury.mock.calls[0][2]);
    expect(store.actions).toBe(actionsBefore);
    expect(store.uses).toHaveLength(0);
  });

  it("enforces the cooldown from the instance and from pulls not yet counted", async () => {
    const counted = freshStore();
    counted.instance.leverLastUsed = { [`stimulus:${characterId.toString()}`]: 9 };
    expect(await pull(counted)).toMatchObject({ ok: false, code: "cooldown" });

    const uncounted = freshStore({
      uses: [
        {
          _id: new ObjectId(),
          crisisId,
          leverId: "stimulus",
          holderId: characterId.toString(),
          submittedTurn: 9,
        },
      ],
    });
    expect(await pull(uncounted)).toMatchObject({ ok: false, code: "cooldown" });
    expect(spendFromTreasury).not.toHaveBeenCalled();

    const cooled = freshStore();
    cooled.instance.leverLastUsed = { [`stimulus:${characterId.toString()}`]: 7 };
    expect(await pull(cooled)).toMatchObject({ ok: true });
  });

  it("rejects a character who does not hold the lever's office", async () => {
    roles.derived = ["any"];
    const store = freshStore();
    expect(await pull(store)).toMatchObject({ ok: false, code: "wrong_role", status: 403 });
    expect(spendFromTreasury).not.toHaveBeenCalled();
    expect(store.uses).toHaveLength(0);
  });

  it("rejects a holder from another country", async () => {
    const store = freshStore({ character: { _id: characterId, countryId: "DE" } });
    expect(await pull(store)).toMatchObject({ ok: false, code: "out_of_jurisdiction" });
  });

  it("rejects a lever outside its stage and on a resolved crisis", async () => {
    registerCrisisDefinition(
      makeDefinition({
        levers: [
          {
            id: "late",
            role: "headOfState",
            label: "Late",
            mitigation: 1,
            cost: {},
            stages: ["peak"],
          },
        ],
      })
    );
    expect(await pull(freshStore(), "late")).toMatchObject({ ok: false, code: "wrong_stage" });
    registerCrisisDefinition(makeDefinition());
    const resolved = freshStore();
    resolved.instance.stage = "resolved";
    expect(await pull(resolved)).toMatchObject({ ok: false, code: "resolved" });
  });

  it("sends a legislature lever to the emergency bill path without charging", async () => {
    roles.derived = ["any"];
    const store = freshStore({ congressLeader: true });
    expect(await pull(store, "relief-bill")).toMatchObject({ ok: false, code: "needs_bill" });
    expect(spendFromTreasury).not.toHaveBeenCalled();
    expect(store.uses).toHaveLength(0);
  });

  it("charges the political weight of a lever from the holder's actions", async () => {
    roles.derived = ["any", "centralBankChair"];
    const store = freshStore();
    const result = await pull(store, "rate-cut");
    expect(result).toMatchObject({ ok: true, actionsSpent: 2 });
    expect(store.actions).toBe(8);
    expect(spendFromTreasury).not.toHaveBeenCalled();
    expect(store.uses[0]).toMatchObject({ cost: { politicalCapital: 5 } });
  });

  it("refuses a pull the holder cannot afford in actions and charges nothing", async () => {
    roles.derived = ["any", "centralBankChair"];
    const store = freshStore({ actions: 1 });
    expect(await pull(store, "rate-cut")).toMatchObject({
      ok: false,
      code: "insufficient_actions",
    });
    expect(store.actions).toBe(1);
    expect(store.uses).toHaveLength(0);
  });

  it("gives the actions back when a later charge fails", async () => {
    debitCorp.mockResolvedValueOnce({ ok: false, error: "Insufficient" });
    registerCrisisDefinition(
      makeDefinition({
        levers: [
          {
            id: "bailout",
            role: "corpCeo",
            label: "Bailout",
            mitigation: 5,
            cost: { politicalCapital: 6, corpCash: 200 },
          },
        ],
      })
    );
    roles.derived = ["any"];
    const store = freshStore({ corporation: { _id: new ObjectId(), countryId: "US" } });
    const result = await pull(store, "bailout", { corporationId: new ObjectId() });
    expect(result).toMatchObject({ ok: false, code: "insufficient_funds" });
    expect(store.actions).toBe(10);
  });

  it("keeps a governor out of a regional crisis that does not reach their state", async () => {
    registerCrisisDefinition(
      makeDefinition({
        scope: "state",
        levers: [{ id: "hire", role: "stateGovernor", label: "Hire", mitigation: 1, cost: {} }],
      })
    );
    roles.derived = ["any", "stateGovernor"];
    const store = freshStore({
      character: {
        _id: characterId,
        countryId: "US",
        currentOffice: { type: "governor", state: "OH" },
      },
    });
    store.instance.scope = "state";
    store.regionIds = ["TX"];
    expect(await pull(store, "hire")).toMatchObject({ ok: false, code: "out_of_jurisdiction" });

    store.regionIds = ["OH"];
    expect(await pull(store, "hire")).toMatchObject({ ok: true });
  });

  it("holds emergency levers back until a state of emergency is declared", async () => {
    registerCrisisDefinition(
      makeDefinition({
        forcedEvents: [
          { id: "soe", event: "stateOfEmergency", minSeverity: 70, sustainedTurns: 1 },
        ],
        levers: [
          {
            id: "powers",
            role: "headOfState",
            label: "Emergency powers",
            mitigation: 4,
            cost: {},
            requiresEmergency: true,
          },
        ],
      })
    );
    const store = freshStore();
    expect(await pull(store, "powers")).toMatchObject({ ok: false, code: "needs_emergency" });
    store.instance.emergency = true;
    expect(await pull(store, "powers")).toMatchObject({ ok: true });
  });

  it("scales the cost by intensity", async () => {
    const store = freshStore();
    await pull(store, "stimulus", { intensity: 0.5 });
    expect(spendFromTreasury).toHaveBeenCalledWith(expect.anything(), "US", 500, expect.anything());
  });

  it("charges the treasury in its own currency, not anchor units", async () => {
    rates.current = { USD: 150 };
    const store = freshStore();
    const result = await pull(store);
    expect(result).toMatchObject({ ok: true, cost: { treasuryCash: 150_000 } });
    expect(spendFromTreasury).toHaveBeenCalledWith(
      expect.anything(),
      "US",
      150_000,
      expect.anything()
    );
  });
});
