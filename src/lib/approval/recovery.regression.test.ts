import {
  abortLeverTransaction,
  fail,
  withLeverTransaction,
} from "@/lib/crises/levers/leverCommand";
import { countryScopeId } from "@/lib/events/substrate/countryScopeId";
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/db/sessionDb", async () =>
  (await import("@/lib/test-utils/atomicDomainMock")).atomicDomainMock()
);
vi.mock("@/lib/news", () => ({ generateAddressNews: vi.fn(), createSystemNewsPost: vi.fn() }));
vi.mock("@/lib/wireEvent", () => ({ logWireEvent: vi.fn() }));
import { ObjectId } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { approvalDeltaUpdate, regionalApprovalSnapshot } from "@/lib/approval/rules/adjustment";
import { reverseCrisisAidPenalties } from "@/lib/crises/aidFinalize";
import { settleCrisisConsequences } from "@/lib/turn/crisisV2/consequences";
import { buildStateApprovalBulkOps } from "@/lib/utils/governmentApproval";
import { computeApprovalMap } from "@/lib/map/approvalService";
import { getRegionalApprovalData } from "@/lib/states/approval/getRegionalApprovalData";
import { evaluateResetApprovalModifiers } from "@/lib/resetMetrics/rules/approval";
import { buildOpeningMetricSnapshots1991 } from "@/lib/resetMetrics/seedOpening1991";
import { applyCrisisEffects } from "@/lib/crises/applyEffects";
import { answerChoiceNode } from "@/lib/crises/interactionEngine";
import { resolveEvent } from "@/lib/events/substrate/resolve";
import { registerEventHandler } from "@/lib/events/substrate/registry";

const row = (_id: string, extra: Record<string, unknown> = {}) => ({
  _id,
  approvalRating: 50,
  approvalRawRating: 50,
  approvalAdjustment: 0,
  activeModifiers: [],
  ...extra,
});
const idle = (id: string, role: string) =>
  Array.from({ length: 8 }, (_, turn) => ({
    turn,
    stage: "peak",
    role,
    holderId: id,
    leverId: null,
    cost: {},
    mitigation: 0,
    severity: 90,
  }));
function record(name: string, fn: () => Promise<any>) {
  it(name, async () => {
    const { actual } = await fn();
    switch (name) {
      case "aid-expiry-race":
        expect(actual).toBe(50);
        break;
      case "fractional-reversal-across-snapshot":
        expect(actual).toBeCloseTo(50, 10);
        break;
      case "regional-derived-totals":
        expect(actual).toMatchObject({
          approvalRating: 47,
          disapprovalRating: 53,
          netApproval: -6,
        });
        break;
      case "crisis-former-governor":
        expect(actual[0].approvalRating).toBeLessThan(50);
        expect(actual[1].approvalRating).toBe(50);
        break;
      case "crisis-npp-holder":
        expect(actual).toEqual({ approvalWrites: 1, electionShifts: 1 });
        break;
      case "crisis-country-collision":
        expect(actual[0].approvalRating).toBeCloseTo(actual[1].approvalRating);
        expect(actual[1].approvalRating).toBeLessThan(50);
        break;
      case "map-vs-canonical":
        expect(actual.map.TX.approval).toBe(actual.canonical.approval);
        break;
      case "housing-unit-conversion":
        expect(actual.map((m: any) => m.id)).not.toContain("affordable_housing");
        expect(actual.map((m: any) => m.id)).toContain("housing_stress");
        break;
      case "missing-approval-document":
        expect(actual.documents[0]).toMatchObject({
          approvalRating: 52,
          approvalBase: 50,
          stateAverage: 50,
          activeRegionalModifiers: [],
        });
        break;
      case "legacy-choice-interruption":
        expect(actual).toBe(52);
        break;
      case "world-event-terminal-interruption":
        expect(actual).toMatchObject({ status: "resolved", approval: 52, retry: "" });
        break;
    }
  });
}

describe("Approval boundary recovery", () => {
  record("aid-expiry-race", async () => {
    const db = createInMemoryDb();
    db.seed("governmentApprovals", [
      row("US", { approvalRating: 45, approvalRawRating: 45, approvalAdjustment: -5 }),
    ]);
    db.seed("crisisAidCommitments", [
      {
        _id: new ObjectId(),
        senderCountryId: "US",
        status: "failed",
        penaltyReversed: false,
        approvalPenaltyExpiresTurn: 10,
      },
    ]);
    await Promise.all([
      reverseCrisisAidPenalties(db as never, 10),
      reverseCrisisAidPenalties(db as never, 10),
    ]);
    return { expected: 50, actual: db.collection("governmentApprovals").docs[0].approvalRating };
  });
  record("fractional-reversal-across-snapshot", async () => {
    const db = createInMemoryDb();
    const c = db.seed("stateApprovalHistory", [row("US:TX")]);
    await c.updateOne({ _id: "US:TX" }, approvalDeltaUpdate(-3.456));
    const before = c.docs[0];
    const snap = regionalApprovalSnapshot(50, [], -3.456, before as never);
    await c.updateOne(
      { _id: "US:TX" },
      {
        $set: {
          approvalRating: snap.approval,
          approvalRawRating: snap.raw,
          activeModifiers: snap.modifiers,
        },
      }
    );
    await c.updateOne({ _id: "US:TX" }, approvalDeltaUpdate(3.456));
    return { expected: 50, actual: c.docs[0].approvalRating };
  });
  record("regional-derived-totals", async () => {
    const db = createInMemoryDb();
    const c = db.seed("stateApprovalHistory", [row("US:TX")]);
    await c.updateOne({ _id: "US:TX" }, approvalDeltaUpdate(-5));
    await c.bulkWrite(
      buildStateApprovalBulkOps([{ stateId: "TX", approval: 47 }], "US", 1, new Date()) as never
    );
    return {
      expected: { approvalRating: 47, disapprovalRating: 53, netApproval: -6 },
      actual: c.docs[0],
    };
  });
  record("crisis-former-governor", async () => {
    const db = createInMemoryDb();
    const id = new ObjectId();
    db.seed("characters", [
      { _id: id, countryId: "US", party: "blue", currentOffice: { type: "governor", state: "CT" } },
    ]);
    db.seed("stateApprovalHistory", [
      row("US:TX", { countryId: "US", stateId: "TX" }),
      row("US:CT", { countryId: "US", stateId: "CT" }),
    ]);
    await settleCrisisConsequences(
      db as never,
      {
        ledger: idle(id.toString(), "stateGovernor").map((entry) => ({
          ...entry,
          attribution: { countryId: "US", stateId: "TX", partyId: "blue" },
        })),
      } as never,
      { crisisId: new ObjectId(), scope: "state", regionIds: ["TX"] } as never,
      40
    );
    return {
      expected: "Historical TX responsibility, not current CT",
      actual: db.collection("stateApprovalHistory").docs,
    };
  });
  record("crisis-npp-holder", async () => {
    const db = createInMemoryDb();
    const id = new ObjectId();
    db.seed("npps", [{ _id: id, countryId: "CA", party: "blue" }]);
    db.seed("governmentApprovals", [row("CA")]);
    const delivery = await settleCrisisConsequences(
      db as never,
      { ledger: idle(id.toString(), "headOfState") } as never,
      { crisisId: new ObjectId(), scope: "national", regionIds: [] } as never,
      40
    );
    return { expected: "Holder accountability applied", actual: delivery };
  });
  record("crisis-country-collision", async () => {
    const db = createInMemoryDb();
    const a = new ObjectId(),
      b = new ObjectId();
    db.seed("characters", [
      { _id: a, countryId: "DE", currentOffice: { type: "governor", state: "HB" } },
      { _id: b, countryId: "CN", currentOffice: { type: "governor", state: "HB" } },
    ]);
    db.seed("stateApprovalHistory", [
      row("DE:HB", { countryId: "DE", stateId: "HB" }),
      row("CN:HB", { countryId: "CN", stateId: "HB" }),
    ]);
    await settleCrisisConsequences(
      db as never,
      {
        ledger: [...idle(a.toString(), "stateGovernor"), ...idle(b.toString(), "stateGovernor")],
      } as never,
      { crisisId: new ObjectId(), scope: "global", regionIds: [] } as never,
      40
    );
    return {
      expected: "Equal penalties in both HB regions",
      actual: db.collection("stateApprovalHistory").docs,
    };
  });
  record("map-vs-canonical", async () => {
    const db = createInMemoryDb();
    db.seed("stateDemographics", [{ _id: "TX", countryId: "US" }]);
    db.seed("states", [{ _id: "TX", countryId: "US", name: "Texas" }]);
    db.seed("macroMetrics", [{ _id: "TX", countryId: "US", economic: {} }]);
    db.seed("gameState", [{ _id: "current", preset: "2027", currentTurn: 20, year: 2027 }]);
    db.seed("stateApprovalHistory", [
      row("US:TX", {
        countryId: "US",
        stateId: "TX",
        approvalRating: 17,
        approvalRawRating: 17,
        baseApproval: 50,
        lastSnapshotTurn: 20,
        history: [],
      }),
    ]);
    const canonical = await getRegionalApprovalData(db as never, "US", "TX");
    const map = await computeApprovalMap(db as never, "US");
    return { expected: "Same approval", actual: { canonical, map } };
  });
  record("housing-unit-conversion", async () => {
    const boards = buildOpeningMetricSnapshots1991("audit", 1);
    const obs = {
      ...boards.find((b) => b._id === "UK:SCO")!.observations,
      ...boards.find((b) => b._id === "UK:national")!.observations,
    };
    obs["24"] = {
      ...obs["24"],
      value: 60,
      unit: "% disposable income spent on housing",
      definitionVersion: 2,
    } as never;
    const modifiers = evaluateResetApprovalModifiers(obs, {
      countryId: "UK",
      preset: "1991-default",
      year: 1991,
    });
    return {
      expected: "60% income housing burden is not affordable",
      actual: modifiers.filter((m) => m.id.includes("housing")),
    };
  });
  record("missing-approval-document", async () => {
    const db = createInMemoryDb();
    await applyCrisisEffects(
      db as never,
      [{ targetType: "approval", effectType: "flat", value: 2 }] as never,
      [],
      ["US"]
    );
    return {
      expected: "Persist delta or signal missing initialization",
      actual: { returnedSuccess: true, documents: db.collection("governmentApprovals").docs },
    };
  });
  record("legacy-choice-interruption", async () => {
    const db = createInMemoryDb();
    const id = new ObjectId(),
      crisisId = new ObjectId();
    db.seed("states", [{ _id: "TX", countryId: "US" }]);
    db.seed("crises", [{ _id: crisisId, scope: "country", countryIds: ["US"], regionIds: [] }]);
    db.seed("governmentApprovals", [row("US")]);
    const node = {
      nodeId: "choice",
      type: "choice",
      options: [
        {
          optionId: "yes",
          effects: [{ targetType: "approval", effectType: "flat", value: 2 }],
          nextNodeId: null,
        },
      ],
    };
    const col = db.seed("crisisInteractions", [
      {
        _id: id,
        crisisId,
        currentNodeId: "choice",
        resolvedAt: null,
        updatedAt: new Date(0),
        resolutionPath: [],
        decisionTree: [node],
      },
    ]);
    const update = col.updateOne.bind(col);
    let interrupt = true;
    col.updateOne = async (f: any, u: any, o: any) => {
      if (interrupt && u.$set?.resolvedAt) {
        interrupt = false;
        throw new Error("injected interruption before navigation commit");
      }
      return update(f, u, o);
    };
    const context = () => ({
      db,
      interactionId: id,
      interaction: { ...col.docs[0], resolutionPath: [...(col.docs[0].resolutionPath as any[])] },
      currentNode: node,
      crisis: null,
      optionId: "yes",
      characterId: new ObjectId(),
      countryId: "US",
    });
    try {
      await answerChoiceNode(context() as never);
    } catch {}
    await answerChoiceNode(context() as never);
    return { expected: 52, actual: db.collection("governmentApprovals").docs[0].approvalRating };
  });
  record("world-event-terminal-interruption", async () => {
    const db = createInMemoryDb();
    const id = new ObjectId();
    db.seed("governmentApprovals", [row("US")]);
    const kind = "approval-audit-only";
    registerEventHandler({
      kind,
      defaultOptionId: "yes",
      options: [
        {
          id: "yes",
          label: "Yes",
          description: "Audit only",
          outcomeTable: [{ minRoll: 1, maxRoll: 100, label: "pass", effects: [] }],
        },
      ],
      applyEffects: async () => {
        await db.collection("governmentApprovals").updateOne({ _id: "US" }, approvalDeltaUpdate(2));
      },
    });
    const col = db.seed("eventInstances", [
      {
        _id: id,
        kind,
        scope: "country",
        scopeId: countryScopeId("US"),
        status: "pending",
        roll: 50,
        payload: {},
        expiresAtRealtimeMs: Date.now() + 60000,
      },
    ]);
    const update = col.findOneAndUpdate.bind(col);
    let interrupt = true;
    col.findOneAndUpdate = async (f: any, u: any, o: any) => {
      const value = await update(f, u, o);
      if (interrupt && u.$set?.status === "resolved") {
        interrupt = false;
        throw new Error("injected lost response after terminal write");
      }
      return value;
    };
    try {
      await resolveEvent(db as never, id, "yes", "player", 1, undefined, "2027", true);
    } catch {}
    let retry = "";
    try {
      await resolveEvent(db as never, id, "yes", "player", 1, undefined, "2027", true);
    } catch (e) {
      retry = String(e);
    }
    return {
      expected: "Recover effect after terminal-write interruption",
      actual: {
        status: col.docs[0].status,
        approval: db.collection("governmentApprovals").docs[0].approvalRating,
        retry,
      },
    };
  });
});

it("rolls back earlier effects when a nested legacy response refuses", async () => {
  const memory = createInMemoryDb();
  const db = memory as never;
  memory.seed("governmentApprovals", [row("US")]);
  const result = await withLeverTransaction(db, async (tx) => {
    await tx
      .collection("governmentApprovals")
      .updateOne({ _id: "US" as never }, approvalDeltaUpdate(-3));
    return withLeverTransaction(tx, async () =>
      abortLeverTransaction(fail("rejected", "The response is no longer available"))
    );
  });
  expect(result).toMatchObject({ ok: false, code: "rejected" });
  expect(memory.collection("governmentApprovals").docs[0].approvalRating).toBe(50);
});
