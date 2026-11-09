import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CrisisInstance } from "@/lib/crises/v2/types";
import { createCrisisInstance } from "@/lib/crises/v2/instance";
import { makeDefinition } from "@/lib/crises/v2/testFixtures";
import type { EffectModule } from "@/lib/crises/v2/effectModule";
import { stanceLeversFor } from "@/lib/crises/v2/stanceLevers";

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }));
const applyCrisisEffects = vi.hoisted(() => vi.fn());
const logWireEvent = vi.hoisted(() => vi.fn());

vi.mock("@/lib/observability/logger", () => ({ logger }));
vi.mock("@/lib/crises/applyEffects", () => ({ applyCrisisEffects }));
vi.mock("@/lib/wireEvent", () => ({ logWireEvent }));

import { processCrisisV2Turn } from "./crisisV2Turn";
import {
  registerCrisisDefinition,
  registerCrisisEffectModule,
  registerCrisisHolderProvider,
  registerCrisisOpenCandidateProvider,
  resetCrisisV2RegistryForTests,
} from "./crisisV2/registry";

interface FakeData {
  crises: Record<string, unknown>[];
  states: { _id: string; countryId: string }[];
  macroMetrics: Record<string, unknown>[];
  leverUses: Record<string, unknown>[];
  config?: Record<string, unknown> | null;
}

function makeDb(data: FakeData) {
  const calls = {
    bulkWrite: vi.fn(async () => ({})),
    insertMany: vi.fn(async () => ({})),
    leverUpdateMany: vi.fn(async () => ({})),
    claim: vi.fn(async () => ({ matchedCount: 1 })),
    collectionsRead: [] as string[],
    leverFilter: undefined as unknown,
  };
  const cursor = (rows: unknown[]) => ({ toArray: async () => rows });
  const db = {
    collection(name: string) {
      return {
        find(filter?: unknown) {
          calls.collectionsRead.push(name);
          if (name === "crisisLeverUses") calls.leverFilter = filter;
          if (name === "crises") {
            const asked = (filter ?? {}) as { status?: string; scarsHealUntil?: unknown };
            return cursor(asked.status === "resolved" || asked.scarsHealUntil ? [] : data.crises);
          }
          if (name === "states") return cursor(data.states);
          if (name === "macroMetrics") return cursor(data.macroMetrics);
          if (name === "crisisLeverUses") return cursor(data.leverUses);
          return cursor([]);
        },
        bulkWrite: calls.bulkWrite,
        insertMany: calls.insertMany,
        updateMany: name === "crisisLeverUses" ? calls.leverUpdateMany : vi.fn(),
        updateOne: calls.claim,
        findOne: vi.fn(async () => (name === "gameConfig" ? (data.config ?? null) : null)),
      };
    },
  };
  return { db: db as never, calls };
}

function liveCrisis(overrides: Partial<CrisisInstance> = {}, id = new ObjectId()) {
  const instance: CrisisInstance = {
    ...createCrisisInstance(makeDefinition(), 0),
    stage: "onset",
    stageStartTurn: 1,
    severity: 40,
    ...overrides,
  };
  return {
    _id: id,
    name: "Test crisis",
    scope: "country",
    countryIds: ["US"],
    regionIds: [],
    wireMessageOnEnd: "Over.",
    startTurn: 0,
    v2: instance,
  };
}

const baseData = (): FakeData => ({
  crises: [],
  states: [
    { _id: "s1", countryId: "US" },
    { _id: "s2", countryId: "US" },
  ],
  macroMetrics: [],
  leverUses: [],
});

function writtenInstances(calls: ReturnType<typeof makeDb>["calls"]): CrisisInstance[] {
  const ops = (calls.bulkWrite.mock.calls[0] as unknown as [unknown[]])[0] as {
    updateOne: { update: { $set: { v2: CrisisInstance } } };
  }[];
  return ops.map((op) => op.updateOne.update.$set.v2);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetCrisisV2RegistryForTests();
  registerCrisisDefinition(makeDefinition());
});

describe("processCrisisV2Turn", () => {
  it("does no per-crisis work when no crisis carries a v2 instance", async () => {
    const { db, calls } = makeDb(baseData());
    const result = await processCrisisV2Turn(db, 10);
    expect(result).toEqual({ processed: 0, failed: 0, resolved: 0, opened: 0 });
    expect(calls.collectionsRead[0]).toBe("crises");
    expect(calls.collectionsRead).not.toContain("crisisLeverUses");
    expect(calls.bulkWrite).not.toHaveBeenCalled();
  });

  it("feeds sim inputs into severity and writes the instance in one bulk write", async () => {
    const base = makeDefinition();
    registerCrisisDefinition(
      makeDefinition({
        severity: {
          ...base.severity,
          drivers: [{ id: "unemployment", input: "unemploymentRate", coefficient: 10 }],
        },
      })
    );
    const data = baseData();
    data.crises = [liveCrisis()];
    data.macroMetrics = [
      { _id: "s1", economic: { unemploymentRate: { value: 4 } } },
      { _id: "s2", economic: { unemploymentRate: { value: 6 } } },
    ];
    const { db, calls } = makeDb(data);
    const result = await processCrisisV2Turn(db, 10);
    expect(result.processed).toBe(1);
    expect(calls.bulkWrite).toHaveBeenCalledTimes(1);
    const [written] = writtenInstances(calls);
    // unemployment coefficient 10 x mean 5, plus one idle turn inside grace
    expect(written.severity).toBe(90);
    expect(written.severityHistory.at(-1)).toEqual({ turn: 10, severity: 90 });
  });

  it("reads unregistered inputs as zero", async () => {
    const data = baseData();
    data.crises = [liveCrisis()];
    const { db, calls } = makeDb(data);
    await processCrisisV2Turn(db, 10);
    const [written] = writtenInstances(calls);
    // no drivers, no mitigation: one idle turn is inside the grace period
    expect(written.severity).toBe(40);
  });

  it("applies lever uses recorded for the crisis and marks them consumed", async () => {
    const data = baseData();
    const crisis = liveCrisis();
    data.crises = [crisis];
    const useId = new ObjectId();
    data.leverUses = [
      {
        _id: useId,
        crisisId: crisis._id,
        leverId: "rate-cut",
        holderId: "chair-1",
        appliedTurn: null,
      },
    ];
    const { db, calls } = makeDb(data);
    await processCrisisV2Turn(db, 10);
    const [written] = writtenInstances(calls);
    expect(written.severity).toBe(32);
    expect(written.ledger).toHaveLength(1);
    expect(written.ledger[0]).toMatchObject({ role: "centralBankChair", leverId: "rate-cut" });
    expect(calls.leverUpdateMany).toHaveBeenCalledWith(
      { _id: { $in: [useId] } },
      { $set: { appliedTurn: 10 } }
    );
  });

  it("leaves lever uses whose cost has not landed yet for a later turn", async () => {
    const data = baseData();
    data.crises = [liveCrisis()];
    const { db, calls } = makeDb(data);
    await processCrisisV2Turn(db, 10);
    expect(calls.leverFilter).toMatchObject({ appliedTurn: null, chargeState: { $ne: "pending" } });
  });

  it("skips a crisis already stepped this turn", async () => {
    const data = baseData();
    data.crises = [liveCrisis({ severityHistory: [{ turn: 10, severity: 40 }] })];
    const { db, calls } = makeDb(data);
    const result = await processCrisisV2Turn(db, 10);
    expect(result.processed).toBe(0);
    expect(calls.bulkWrite).not.toHaveBeenCalled();
  });

  it("leaves crises with an unregistered definition untouched", async () => {
    const data = baseData();
    data.crises = [liveCrisis({ definitionId: "unknown" })];
    const { db, calls } = makeDb(data);
    const result = await processCrisisV2Turn(db, 10);
    expect(result.processed).toBe(0);
    expect(calls.bulkWrite).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      "crisisV2Turn",
      expect.stringContaining("unregistered definitions"),
      { definitions: ["unknown"] }
    );
  });

  it("resolves a contained crisis and closes its document", async () => {
    const data = baseData();
    data.crises = [liveCrisis({ stage: "aftermath", stageStartTurn: 1, severity: 10 })];
    const { db, calls } = makeDb(data);
    const result = await processCrisisV2Turn(db, 10);
    expect(result.resolved).toBe(1);
    const ops = (calls.bulkWrite.mock.calls[0] as unknown as [unknown[]])[0] as {
      updateOne: { update: { $set: Record<string, unknown> } };
    }[];
    expect(ops[0].updateOne.update.$set).toMatchObject({ status: "resolved", endTurn: 10 });
    expect(logWireEvent).toHaveBeenCalledWith("crisis_end", "Over.", expect.anything());
  });
});

describe("turn claim", () => {
  it("claims the turn before routing effects and records it on the instance", async () => {
    const order: string[] = [];
    applyCrisisEffects.mockImplementation(async () => void order.push("effects"));
    registerCrisisEffectModule({ id: "legacy", evaluate: () => [{ kind: "approval", delta: -1 }] });
    const data = baseData();
    data.crises = [liveCrisis()];
    const { db, calls } = makeDb(data);
    calls.claim.mockImplementation((async (_filter: unknown, update: { $set?: object }) => {
      // delivery progress also writes through updateOne; only the claim counts here
      if (update.$set && "v2.lastEvaluatedTurn" in update.$set) order.push("claim");
      return { matchedCount: 1 };
    }) as never);
    await processCrisisV2Turn(db, 10);
    expect(order).toEqual(["claim", "effects"]);
    expect(calls.claim).toHaveBeenCalledWith(expect.objectContaining({ status: "active" }), {
      $set: { "v2.lastEvaluatedTurn": 10 },
    });
    expect(writtenInstances(calls)[0].lastEvaluatedTurn).toBe(10);
  });

  it("does not re-apply effects when the claim was already taken", async () => {
    registerCrisisEffectModule({ id: "legacy", evaluate: () => [{ kind: "approval", delta: -1 }] });
    const data = baseData();
    data.crises = [liveCrisis()];
    const { db, calls } = makeDb(data);
    calls.claim.mockResolvedValue({ matchedCount: 0 });
    await processCrisisV2Turn(db, 10);
    expect(applyCrisisEffects).not.toHaveBeenCalled();
    expect(calls.bulkWrite).not.toHaveBeenCalled();
  });

  it("skips a crisis whose instance already records this turn as evaluated", async () => {
    const data = baseData();
    data.crises = [liveCrisis({ lastEvaluatedTurn: 10 })];
    const { db, calls } = makeDb(data);
    await processCrisisV2Turn(db, 10);
    expect(calls.claim).not.toHaveBeenCalled();
    expect(calls.bulkWrite).not.toHaveBeenCalled();
  });
});

describe("effect routing", () => {
  const moduleOf = (intents: ReturnType<EffectModule["evaluate"]>): EffectModule => ({
    id: "legacy",
    evaluate: () => intents,
  });

  it("sends legacy intents through the existing writers", async () => {
    registerCrisisEffectModule(moduleOf([{ kind: "approval", delta: -2 }]));
    const data = baseData();
    data.crises = [liveCrisis()];
    const { db } = makeDb(data);
    await processCrisisV2Turn(db, 10);
    expect(applyCrisisEffects).toHaveBeenCalledTimes(1);
    const [, effects, stateIds, countryIds] = applyCrisisEffects.mock.calls[0];
    expect(effects).toEqual([expect.objectContaining({ targetType: "approval", value: -2 })]);
    expect(stateIds).toEqual(["s1", "s2"]);
    expect(countryIds).toEqual(["US"]);
  });

  it("logs unsupported intent kinds instead of dropping them silently", async () => {
    registerCrisisEffectModule(moduleOf([{ kind: "stat", statKey: "charisma", delta: 1 }]));
    const data = baseData();
    data.crises = [liveCrisis()];
    const { db } = makeDb(data);
    const result = await processCrisisV2Turn(db, 10);
    expect(result.processed).toBe(1);
    expect(applyCrisisEffects).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith("crisisV2Turn", "unsupported intent kinds dropped", {
      stat: 1,
    });
  });
});

describe("per-crisis isolation", () => {
  it("keeps stepping other crises when one throws", async () => {
    const bad = liveCrisis();
    const good = liveCrisis();
    registerCrisisEffectModule({
      id: "legacy",
      evaluate: (ctx) => {
        if (ctx.instance.startTurn === 99) throw new Error("boom");
        return [];
      },
    });
    bad.v2 = { ...bad.v2, startTurn: 99 };
    const data = baseData();
    data.crises = [bad, good];
    const { db, calls } = makeDb(data);
    const result = await processCrisisV2Turn(db, 10);
    expect(result).toMatchObject({ processed: 1, failed: 1 });
    const ops = (calls.bulkWrite.mock.calls[0] as unknown as [unknown[]])[0] as {
      updateOne: { filter: { _id: ObjectId } };
    }[];
    expect(ops).toHaveLength(1);
    expect(ops[0].updateOne.filter._id).toBe(good._id);
    expect(logger.error).toHaveBeenCalledWith(
      "crisisV2Turn",
      expect.stringContaining("crisis step failed"),
      expect.any(Error),
      expect.objectContaining({ crisisId: bad._id.toString() })
    );
  });

  it("does not throw when the bulk write fails", async () => {
    const data = baseData();
    data.crises = [liveCrisis()];
    const { db, calls } = makeDb(data);
    calls.bulkWrite.mockRejectedValueOnce(new Error("write failed"));
    const result = await processCrisisV2Turn(db, 10);
    expect(result).toMatchObject({ processed: 0, failed: 1 });
    expect(calls.leverUpdateMany).not.toHaveBeenCalled();
  });
});

describe("inaction ledger", () => {
  beforeEach(() => {
    registerCrisisHolderProvider({
      id: "test",
      load: async () =>
        new Map([
          [
            "US",
            {
              headOfState: ["pres-1"],
              centralBankChair: ["chair-1"],
              corpCeo: ["ceo-1"],
            },
          ],
        ]),
    });
  });

  it("records inaction for holders with an available lever who pulled none", async () => {
    const data = baseData();
    data.crises = [liveCrisis()];
    const { db, calls } = makeDb(data);
    await processCrisisV2Turn(db, 10);
    const [written] = writtenInstances(calls);
    const idle = written.ledger.filter((row) => row.leverId === null);
    expect(idle.map((row) => `${row.role}:${row.holderId}`).sort()).toEqual([
      "centralBankChair:chair-1",
      "headOfState:pres-1",
    ]);
    expect(idle.every((row) => row.turn === 10 && row.stage === "onset")).toBe(true);
    // corpCeo has no lever in the definition, so nobody is blamed for it
    expect(idle.some((row) => row.role === "corpCeo")).toBe(false);
  });

  it("does not blame a holder who acted", async () => {
    const data = baseData();
    const crisis = liveCrisis();
    data.crises = [crisis];
    data.leverUses = [
      {
        _id: new ObjectId(),
        crisisId: crisis._id,
        leverId: "rate-cut",
        holderId: "chair-1",
        appliedTurn: null,
      },
    ];
    const { db, calls } = makeDb(data);
    await processCrisisV2Turn(db, 10);
    const [written] = writtenInstances(calls);
    const byHolder = new Map(written.ledger.map((row) => [row.holderId, row]));
    expect(byHolder.get("chair-1")?.leverId).toBe("rate-cut");
    expect(byHolder.get("pres-1")?.leverId).toBeNull();
    expect(written.ledger.filter((row) => row.holderId === "chair-1")).toHaveLength(1);
  });

  it("does not blame anyone in the aftermath", async () => {
    const data = baseData();
    data.crises = [liveCrisis({ stage: "aftermath", severity: 50, stageStartTurn: 9 })];
    const { db, calls } = makeDb(data);
    await processCrisisV2Turn(db, 10);
    const [written] = writtenInstances(calls);
    expect(written.ledger).toEqual([]);
  });
});

describe("director integration", () => {
  it("opens approved candidates and holds the rest back", async () => {
    registerCrisisOpenCandidateProvider({
      id: "test",
      load: async () => [
        {
          key: "a",
          definitionId: "test-crisis",
          scope: "national",
          countryIds: ["US"],
          regionIds: [],
          priority: 1,
        },
        {
          key: "b",
          definitionId: "test-crisis",
          scope: "national",
          countryIds: ["DE"],
          regionIds: [],
          priority: 0,
        },
      ],
    });
    const { db, calls } = makeDb({ ...baseData(), config: { crisisV2EmergentEnabled: true } });
    const result = await processCrisisV2Turn(db, 10);
    expect(result.opened).toBe(1);
    const docs = (
      calls.insertMany.mock.calls[0] as unknown as [{ countryIds: string[]; v2: CrisisInstance }[]]
    )[0];
    expect(docs).toHaveLength(1);
    expect(docs[0].countryIds).toEqual(["US"]);
    expect(docs[0].v2.stage).toBe("signal");
  });

  it.each([
    ["off", { crisisV2EmergentEnabled: false }],
    ["absent", {}],
    ["an unseeded config", null],
  ])("opens no emergent crisis when the switch is %s", async (_label, config) => {
    const load = vi.fn(async () => [
      {
        key: "a",
        definitionId: "test-crisis",
        scope: "national" as const,
        countryIds: ["US"],
        regionIds: [],
        priority: 1,
      },
    ]);
    registerCrisisOpenCandidateProvider({ id: "test", load });
    const { db, calls } = makeDb({ ...baseData(), config });
    const result = await processCrisisV2Turn(db, 10);
    expect(result.opened).toBe(0);
    expect(load).not.toHaveBeenCalled();
    expect(calls.insertMany).not.toHaveBeenCalled();
  });

  it("still steps an open crisis when the switch is off", async () => {
    const data = { ...baseData(), config: { crisisV2EmergentEnabled: false } };
    data.crises = [liveCrisis()];
    const { db, calls } = makeDb(data);
    const result = await processCrisisV2Turn(db, 10);
    expect(result.processed).toBe(1);
    expect(calls.bulkWrite).toHaveBeenCalledTimes(1);
  });
});

describe("stance levers", () => {
  const pulled = (leverId: string, countryId?: string) => {
    registerCrisisDefinition(
      makeDefinition({ id: "stance-test", levers: stanceLeversFor("second_pandemic") })
    );
    const crisis = liveCrisis({
      ...createCrisisInstance(makeDefinition({ id: "stance-test" }), 0),
      stage: "peak",
      stageStartTurn: 1,
      severity: 60,
    });
    const data = baseData();
    data.crises = [{ ...crisis, v2: { ...crisis.v2, definitionId: "stance-test" } }];
    data.leverUses = [
      {
        _id: new ObjectId(),
        crisisId: crisis._id,
        leverId,
        holderId: "head-1",
        appliedTurn: null,
        ...(countryId ? { countryId } : {}),
      },
    ];
    return makeDb(data);
  };

  it("sends a lockdown's consequences to the country the holder acted for", async () => {
    const { db } = pulled("lockdown", "US");
    await processCrisisV2Turn(db, 10);
    const effects = applyCrisisEffects.mock.calls.flatMap(
      ([, list]) => list as { targetType: string }[]
    );
    expect(effects.length).toBeGreaterThan(0);
    const [, , stateIds, countryIds] = applyCrisisEffects.mock.calls.at(-1) as unknown[];
    expect(stateIds).toEqual(["s1", "s2"]);
    expect(countryIds).toEqual(["US"]);
  });

  it("sends nothing for a pull that recorded no country", async () => {
    const { db } = pulled("lockdown");
    await processCrisisV2Turn(db, 10);
    expect(applyCrisisEffects).not.toHaveBeenCalled();
  });
});
