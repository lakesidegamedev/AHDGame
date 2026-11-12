import { ObjectId, type Db } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { leversFromDecisionTree } from "@/lib/crises/v2/legacyConvert";
import type { CrisisLeverDef } from "@/lib/crises/v2/types";
import type { Crisis, CrisisDecisionNode, CrisisInteraction } from "@/lib/db/types/crisis";

const hooks = vi.hoisted(() => ({
  runAction: vi.fn(),
  applyEffects: vi.fn(),
  spend: vi.fn(),
  aidBill: vi.fn(),
  roles: ["headOfState"] as string[],
  slots: new Set<string>(),
  undo: vi.fn(),
  eligibility: { lever: null as unknown, crisis: null as unknown },
}));

vi.mock("@/lib/wireEvent", () => ({ logWireEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/crises/optionActions", () => ({ runCrisisOptionAction: hooks.runAction }));
vi.mock("@/lib/crises/applyEffects", () => ({ applyCrisisEffects: hooks.applyEffects }));
vi.mock("@/lib/budget/treasurySpend", () => ({ spendFromTreasury: hooks.spend }));
vi.mock("@/lib/legislature/commands/proposeCrisisAidBill", () => ({
  proposeCrisisAidBill: hooks.aidBill,
}));
vi.mock("@/lib/gameState", () => ({ getGameState: async () => ({ currentTurn: 5 }) }));
vi.mock("@/lib/db/collections/characters", () => ({
  getCharactersCollection: async () => ({
    findOne: async () => ({
      _id: CHARACTER_ID,
      name: "Test Leader",
      countryId: "US",
      currentOffice: { type: "president" },
    }),
  }),
}));
vi.mock("@/lib/crises/interactionEngine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/crises/interactionEngine")>()),
  resolveCharacterRoles: async () => hooks.roles,
}));
vi.mock("./leverCommand", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./leverCommand")>();
  return {
    ...actual,
    checkLeverEligibility: async () => ({
      ok: true,
      context: {
        crisis: hooks.eligibility.crisis,
        lever: hooks.eligibility.lever,
        actor: { _id: CHARACTER_ID, countryId: "US" },
        turn: 5,
        def: {},
        countryIds: ["US"],
      },
    }),
    commitLeverUse: async (_db: unknown, args: { lever: { id: string }; holderId: ObjectId }) => {
      const slot = `${args.lever.id}:${args.holderId.toString()}:5`;
      if (hooks.slots.has(slot)) return actual.fail("duplicate", "You already pulled this lever");
      hooks.slots.add(slot);
      return {
        ok: true,
        useId: new ObjectId(),
        cost: {},
        actionsSpent: 0,
        undo: async () => {
          hooks.slots.delete(slot);
          await hooks.undo();
        },
      };
    },
  };
});

import { pullLeverWithDecision } from "./legacyLever";
import { submitCrisisDecision } from "@/lib/crises/interactionEngine";

const CHARACTER_ID = new ObjectId();
const CRISIS_ID = new ObjectId();

const EFFECT = { targetType: "metric", metric: "approval", magnitude: -2 } as never;

const TREE: CrisisDecisionNode[] = [
  {
    nodeId: "respond",
    type: "choice",
    title: "Respond",
    description: "",
    requiredRoles: ["headOfState"],
    timeLimitMinutes: null,
    options: [
      {
        optionId: "act",
        label: "Act",
        description: "",
        effects: [EFFECT],
        nextNodeId: "done",
        requiredBudget: 100,
        durationReductionTurns: 2,
        action: { kind: "openBargaining" } as never,
      },
      { optionId: "wait", label: "Wait", description: "", effects: [], nextNodeId: "done" },
    ],
  },
  {
    nodeId: "aid",
    type: "aid",
    title: "Aid",
    description: "",
    requiredRoles: ["headOfState"],
    timeLimitMinutes: null,
    options: [],
  },
  {
    nodeId: "fund",
    type: "collective",
    title: "Fund",
    description: "",
    requiredRoles: ["headOfState"],
    timeLimitMinutes: null,
    collectiveTarget: 1_000,
    options: [
      {
        optionId: "give",
        label: "Give",
        description: "",
        collectiveContribution: 300,
        effects: [],
        nextNodeId: null,
      },
    ],
  },
  {
    nodeId: "done",
    type: "terminal",
    title: "Done",
    description: "",
    requiredRoles: ["any"],
    timeLimitMinutes: null,
    outcomeEffects: [],
    outcomeMessage: "Resolved.",
  },
];

const levers = leversFromDecisionTree(TREE);
const leverById = (id: string): CrisisLeverDef => levers.find((l) => l.id === id)!;

const BUDGET = { gdp: 1_000_000, treasuryBalance: 10_000 };

let db: MockDb;
let state: CrisisInteraction;

function crisisDoc(definitionId: string): Crisis {
  return {
    _id: CRISIS_ID,
    name: "Test",
    description: "",
    scope: "country",
    countryIds: ["US"],
    regionIds: [],
    durationTurns: 6,
    effects: [],
    status: "active",
    createdBy: new ObjectId(),
    createdAt: new Date(),
    resolvedAt: null,
    startTurn: 1,
    endTurn: null,
    wireMessageOnStart: "",
    wireMessageOnEnd: "",
    ...(definitionId ? { v2: { definitionId } } : {}),
  } as unknown as Crisis;
}

function install(currentNodeId: string) {
  state = {
    _id: new ObjectId(),
    crisisId: CRISIS_ID,
    decisionTree: TREE,
    currentNodeId,
    collectiveTarget: null,
    collectiveCurrent: 0,
    contributors: [],
    decisionDeadline: null,
    autoResolveOnExpiry: true,
    resolvedAt: null,
    resolutionPath: [],
    resolutionOutcome: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as CrisisInteraction;
  const interactions = db.collectionMocks.crisisInteractions;
  interactions.findOne.mockImplementation(async () => ({
    ...state,
    resolutionPath: [...state.resolutionPath],
    contributors: [...state.contributors],
  }));
  interactions.updateOne.mockImplementation(
    async (filter: Record<string, unknown>, update: Record<string, any>) => {
      const none = { matchedCount: 0, modifiedCount: 0 };
      if (filter.resolvedAt === null && state.resolvedAt) return none;
      if (filter.currentNodeId !== undefined && filter.currentNodeId !== state.currentNodeId) {
        return none;
      }
      if (filter.updatedAt && +(filter.updatedAt as Date) !== +state.updatedAt) return none;
      const slot = filter["contributors.characterId"] as { $ne: ObjectId } | undefined;
      if (slot && state.contributors.some((c) => c.characterId.equals(slot.$ne))) return none;
      Object.assign(state, update.$set ?? {});
      if (update.$push?.contributors) state.contributors.push(update.$push.contributors);
      if (update.$push?.resolutionPath) state.resolutionPath.push(update.$push.resolutionPath);
      if (update.$inc?.collectiveCurrent) state.collectiveCurrent += update.$inc.collectiveCurrent;
      if (update.$pull?.contributors) state.contributors = [];
      return { matchedCount: 1, modifiedCount: 1 };
    }
  );
}

function pull(leverId: string, extra: Record<string, unknown> = {}) {
  hooks.eligibility.lever = leverById(leverId);
  return pullLeverWithDecision(db as unknown as Db, {
    crisisId: CRISIS_ID,
    leverId,
    characterId: CHARACTER_ID,
    ...extra,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.slots.clear();
  hooks.roles = ["headOfState"];
  hooks.runAction.mockResolvedValue({});
  hooks.spend.mockResolvedValue({});
  hooks.aidBill.mockResolvedValue(undefined);
  db = createMockDb();
  [
    "crises",
    "crisisInteractions",
    "crisisAidCommitments",
    "federalBudget",
    "governmentApprovals",
    "characters",
    "states",
  ].forEach((name) => db.collection(name));
  const crisis = crisisDoc("legacy:test");
  hooks.eligibility.crisis = crisis;
  db.collectionMocks.crises.findOne.mockResolvedValue(crisis);
  db.collectionMocks.federalBudget.findOne.mockResolvedValue(BUDGET);
});

describe("converted choice options run their authored side effects once", () => {
  it("applies effects and the action hook once, then advances the legacy node", async () => {
    install("respond");
    const result = await pull("respond.act");
    expect(result.ok).toBe(true);
    expect(hooks.applyEffects).toHaveBeenCalledTimes(1);
    expect(hooks.runAction).toHaveBeenCalledTimes(1);
    expect(state.currentNodeId).toBeNull();
    expect(state.resolvedAt).toBeInstanceOf(Date);
    expect(state.resolutionPath).toEqual(["act", "done"]);
  });

  it("fires the hook once when the same lever is submitted twice at once", async () => {
    install("respond");
    const [a, b] = await Promise.all([pull("respond.act"), pull("respond.act")]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(hooks.runAction).toHaveBeenCalledTimes(1);
    expect(hooks.applyEffects).toHaveBeenCalledTimes(1);
  });

  it("fires the hook once across sequential submits", async () => {
    install("respond");
    expect((await pull("respond.act")).ok).toBe(true);
    const again = await pull("respond.act");
    expect(again.ok).toBe(false);
    expect(hooks.runAction).toHaveBeenCalledTimes(1);
  });

  it("refunds the pull and skips the hook when the decision claim is lost", async () => {
    install("respond");
    const real = db.collectionMocks.crisisInteractions.updateOne.getMockImplementation()!;
    db.collectionMocks.crisisInteractions.updateOne.mockImplementationOnce(async () => ({
      matchedCount: 0,
      modifiedCount: 0,
    }));
    const result = await pull("respond.act");
    expect(result).toMatchObject({ ok: false, code: "rejected" });
    expect(hooks.undo).toHaveBeenCalledTimes(1);
    expect(hooks.runAction).not.toHaveBeenCalled();
    expect(hooks.applyEffects).not.toHaveBeenCalled();
    db.collectionMocks.crisisInteractions.updateOne.mockImplementation(real);
    expect((await pull("respond.act")).ok).toBe(true);
  });

  it("does not double-charge the option budget on the decision path", async () => {
    install("respond");
    await pull("respond.act");
    expect(hooks.spend).not.toHaveBeenCalled();
  });

  it("applies the same effects and hook as the old decision path for the same fixture", async () => {
    install("respond");
    await pull("respond.act");
    const viaLever = {
      effects: hooks.applyEffects.mock.calls.map((c) => c.slice(1)),
      action: hooks.runAction.mock.calls.map(([arg]) => ({
        option: arg.option.optionId,
        countryId: arg.countryId,
        turn: arg.currentTurn,
      })),
      path: [...state.resolutionPath],
    };

    vi.clearAllMocks();
    hooks.slots.clear();
    hooks.runAction.mockResolvedValue({});
    hooks.spend.mockResolvedValue({});
    db.collectionMocks.crises.findOne.mockResolvedValue(crisisDoc(""));
    db.collectionMocks.federalBudget.findOne.mockResolvedValue(BUDGET);
    install("respond");
    await submitCrisisDecision(db as unknown as Db, state._id, "act", CHARACTER_ID, "US", [
      "headOfState",
    ]);
    const viaDecision = {
      effects: hooks.applyEffects.mock.calls.map((c) => c.slice(1)),
      action: hooks.runAction.mock.calls.map(([arg]) => ({
        option: arg.option.optionId,
        countryId: arg.countryId,
        turn: arg.currentTurn,
      })),
      path: [...state.resolutionPath],
    };
    expect(viaLever).toEqual(viaDecision);
    expect(viaLever.effects).toHaveLength(1);
  });

  it("rejects the old decision call for a converted option", async () => {
    install("respond");
    await expect(
      submitCrisisDecision(db as unknown as Db, state._id, "act", CHARACTER_ID, "US", [
        "headOfState",
      ])
    ).rejects.toThrow("answered through its levers");
    expect(hooks.runAction).not.toHaveBeenCalled();
  });
});

describe("pooled aid and collective levers", () => {
  it("files the aid bill and charges the treasury once for a pledge pull", async () => {
    install("aid");
    db.collectionMocks.federalBudget.findOne.mockResolvedValue(BUDGET);
    db.collectionMocks.crisisAidCommitments.insertOne.mockResolvedValue({});
    db.collectionMocks.crisisAidCommitments.findOne.mockResolvedValue(null);

    const first = await pull("pool.aid", { pctGdp: 0.001 });
    expect(first.ok).toBe(true);
    expect(hooks.spend).toHaveBeenCalledTimes(1);
    expect(hooks.aidBill).toHaveBeenCalledTimes(1);
    expect(state.resolvedAt).toBeInstanceOf(Date);

    const second = await pull("pool.aid", { pctGdp: 0.001 });
    expect(second.ok).toBe(false);
    expect(hooks.spend).toHaveBeenCalledTimes(1);
    expect(hooks.aidBill).toHaveBeenCalledTimes(1);
  });

  it("refuses a pledge above the node's cap and refunds the pull", async () => {
    install("aid");
    db.collectionMocks.federalBudget.findOne.mockResolvedValue(BUDGET);
    db.collectionMocks.crisisAidCommitments.findOne.mockResolvedValue(null);
    for (const pctGdp of [0.5, 0.0001 * -1]) {
      const result = await pull("pool.aid", { pctGdp });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toBe("Invalid aid amount");
    }
    expect(hooks.undo).toHaveBeenCalledTimes(2);
    expect(hooks.spend).not.toHaveBeenCalled();
    expect(hooks.aidBill).not.toHaveBeenCalled();
  });

  it("refunds the pull when the pledge spend fails", async () => {
    install("aid");
    db.collectionMocks.federalBudget.findOne.mockResolvedValue(BUDGET);
    db.collectionMocks.crisisAidCommitments.insertOne.mockResolvedValue({});
    db.collectionMocks.crisisAidCommitments.findOne.mockResolvedValue(null);
    hooks.spend.mockRejectedValue(new Error("treasury down"));
    await expect(pull("pool.aid", { pctGdp: 0.001 })).rejects.toThrow("treasury down");
    expect(hooks.undo).toHaveBeenCalledTimes(1);
    expect(hooks.aidBill).not.toHaveBeenCalled();
    expect(db.collectionMocks.crisisAidCommitments.deleteOne).toHaveBeenCalledTimes(1);
  });

  it("claims a contribution, spends once and refuses a second", async () => {
    install("fund");
    expect((await pull("pool.fund.give")).ok).toBe(true);
    expect(hooks.spend).toHaveBeenCalledTimes(1);
    expect(state.collectiveCurrent).toBe(300);
    expect(state.contributors).toHaveLength(1);
    expect((await pull("pool.fund.give")).ok).toBe(false);
    expect(hooks.spend).toHaveBeenCalledTimes(1);
    expect(state.collectiveCurrent).toBe(300);
  });

  it("rolls the contribution back and refunds the pull when the spend fails", async () => {
    install("fund");
    hooks.spend.mockRejectedValue(new Error("treasury down"));
    await expect(pull("pool.fund.give")).rejects.toThrow("treasury down");
    expect(hooks.undo).toHaveBeenCalledTimes(1);
    expect(state.collectiveCurrent).toBe(0);
    expect(state.contributors).toHaveLength(0);
    expect(hooks.slots.size).toBe(0);
  });
});
