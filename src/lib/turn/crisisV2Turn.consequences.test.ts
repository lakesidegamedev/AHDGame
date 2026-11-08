import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCrisisInstance } from "@/lib/crises/v2/instance";
import { makeDefinition } from "@/lib/crises/v2/testFixtures";
import type { CrisisInstance } from "@/lib/crises/v2/types";

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }));
const applyCrisisEffects = vi.hoisted(() => vi.fn());
const settleCrisisConsequences = vi.hoisted(() => vi.fn(async () => ({})));
const runForcedEvents = vi.hoisted(() => vi.fn(async () => 1));
const processCrisisScars = vi.hoisted(() => vi.fn(async () => ({ advanced: 0, failed: 0 })));

vi.mock("@/lib/observability/logger", () => ({ logger }));
vi.mock("@/lib/crises/applyEffects", () => ({ applyCrisisEffects }));
vi.mock("@/lib/wireEvent", () => ({ logWireEvent: vi.fn() }));
vi.mock("./crisisV2/consequences", () => ({ settleCrisisConsequences }));
vi.mock("./crisisV2/forcedEventsShell", () => ({ runForcedEvents }));
vi.mock("./crisisV2/scarsShell", () => ({ processCrisisScars }));

import { processCrisisV2Turn } from "./crisisV2Turn";
import {
  registerCrisisDefinition,
  registerCrisisEffectModule,
  registerCrisisHolderProvider,
  resetCrisisV2RegistryForTests,
} from "./crisisV2/registry";

function makeDb(crises: Record<string, unknown>[], bulkFails = false) {
  const bulkWrite = vi.fn(async () => {
    if (bulkFails) throw new Error("write failed");
    return {};
  });
  const cursor = (rows: unknown[]) => ({ toArray: async () => rows });
  const db = {
    collection(name: string) {
      return {
        find(filter?: { status?: string; scarsHealUntil?: unknown }) {
          if (name === "crises") {
            return cursor(filter?.status === "resolved" || filter?.scarsHealUntil ? [] : crises);
          }
          if (name === "states") {
            return cursor([
              { _id: "TX", countryId: "US" },
              { _id: "OH", countryId: "US" },
            ]);
          }
          return cursor([]);
        },
        bulkWrite,
        insertMany: vi.fn(),
        updateMany: vi.fn(),
        updateOne: vi.fn(async () => ({ matchedCount: 1 })),
        findOne: vi.fn(async () => null),
      };
    },
  };
  return { db: db as never, bulkWrite };
}

function liveCrisis(over: Partial<CrisisInstance>, scope: "country" | "region" = "country") {
  return {
    _id: new ObjectId(),
    name: "Test crisis",
    scope,
    countryIds: ["US"],
    regionIds: scope === "region" ? ["TX"] : [],
    startTurn: 0,
    v2: {
      ...createCrisisInstance(makeDefinition(), 0),
      stage: "peak",
      stageStartTurn: 2,
      severity: 80,
      peakSeverity: 80,
      ...over,
    } as CrisisInstance,
  };
}

function writtenSet(bulkWrite: ReturnType<typeof vi.fn>) {
  const ops = (bulkWrite.mock.calls[0] as unknown as [unknown[]])[0] as {
    updateOne: { update: { $set: Record<string, unknown> & { v2: CrisisInstance } } };
  }[];
  return ops.map((op) => op.updateOne.update.$set);
}

beforeEach(() => {
  vi.clearAllMocks();
  resetCrisisV2RegistryForTests();
});

describe("scars", () => {
  const scarred = makeDefinition({
    scarRules: [
      {
        id: "lost-output",
        kind: "regionalOutput",
        onStage: "aftermath",
        minPeakSeverity: 50,
        magnitudePerPoint: 0.001,
        recoveryTurns: 20,
      },
    ],
  });

  it("lays a scar when the crisis enters the stage and records when it finishes healing", async () => {
    registerCrisisDefinition(scarred);
    const { db, bulkWrite } = makeDb([
      liveCrisis({ stage: "aftermath", stageStartTurn: 4, severity: 40, peakSeverity: 90 }),
    ]);
    await processCrisisV2Turn(db, 10);
    const [set] = writtenSet(bulkWrite);
    expect(set.v2.scars).toHaveLength(1);
    expect(set.v2.scars[0]).toMatchObject({ targetId: "US", createdTurn: 10, recoveryTurns: 20 });
    expect(set.v2.scars[0].magnitude).toBeCloseTo(0.04);
    expect(set.scarsHealUntil).toBe(30);
  });

  it("does not lay one while the peak stayed under the floor", async () => {
    registerCrisisDefinition(scarred);
    const { db, bulkWrite } = makeDb([
      liveCrisis({ stage: "aftermath", stageStartTurn: 4, severity: 40, peakSeverity: 45 }),
    ]);
    await processCrisisV2Turn(db, 10);
    const [set] = writtenSet(bulkWrite);
    expect(set.v2.scars).toEqual([]);
    expect(set).not.toHaveProperty("scarsHealUntil");
  });

  it("runs the scar healing pass every turn", async () => {
    registerCrisisDefinition(scarred);
    const { db } = makeDb([]);
    await processCrisisV2Turn(db, 10);
    expect(processCrisisScars).toHaveBeenCalledWith(db, 10);
  });

  it("lays scars on the regions of a regional crisis", async () => {
    registerCrisisDefinition(makeDefinition({ ...scarred, scope: "state" }));
    const { db, bulkWrite } = makeDb([
      liveCrisis(
        { scope: "state", stage: "aftermath", stageStartTurn: 4, severity: 40, peakSeverity: 90 },
        "region"
      ),
    ]);
    await processCrisisV2Turn(db, 10);
    expect(writtenSet(bulkWrite)[0].v2.scars.map((s) => s.targetId)).toEqual(["TX"]);
  });
});

describe("forced events", () => {
  const forcing = makeDefinition({
    forcedEvents: [
      { id: "strike", event: "strike", minSeverity: 70, sustainedTurns: 2, stages: ["peak"] },
      {
        id: "soe",
        event: "stateOfEmergency",
        minSeverity: 70,
        sustainedTurns: 1,
        stages: ["peak"],
      },
    ],
  });

  it("declares a state of emergency on the instance and runs the other events once saved", async () => {
    registerCrisisDefinition(forcing);
    registerCrisisEffectModule({ id: "legacy", evaluate: () => [] });
    const { db, bulkWrite } = makeDb([
      liveCrisis({ forced: { streaks: { strike: 1 }, fired: [] } }),
    ]);
    await processCrisisV2Turn(db, 10);
    const [set] = writtenSet(bulkWrite);
    expect(set.v2.emergency).toBe(true);
    expect(set.v2.forced?.fired.sort()).toEqual(["soe", "strike"]);
    expect(runForcedEvents).toHaveBeenCalledTimes(1);
    const fired = (runForcedEvents.mock.calls[0] as unknown as [unknown, { event: string }[]])[1];
    expect(fired.map((f) => f.event).sort()).toEqual(["stateOfEmergency", "strike"]);
  });

  it("does not fire an event again once it has fired", async () => {
    registerCrisisDefinition(forcing);
    const { db } = makeDb([
      liveCrisis({ emergency: true, forced: { streaks: {}, fired: ["strike", "soe"] } }),
    ]);
    await processCrisisV2Turn(db, 10);
    expect(runForcedEvents).not.toHaveBeenCalled();
  });

  it("keeps a state of emergency costing approval every turn it lasts", async () => {
    registerCrisisDefinition(forcing);
    registerCrisisEffectModule({ id: "legacy", evaluate: () => [] });
    const { db } = makeDb([
      liveCrisis({ emergency: true, forced: { streaks: {}, fired: ["strike", "soe"] } }),
    ]);
    await processCrisisV2Turn(db, 10);
    expect(applyCrisisEffects).toHaveBeenCalledTimes(1);
    const effects = (
      applyCrisisEffects.mock.calls[0] as unknown as [
        unknown,
        { targetType: string; value: number }[],
      ]
    )[1];
    expect(effects[0]).toMatchObject({ targetType: "approval" });
    expect(effects[0].value).toBeLessThan(0);
  });

  it("does not run side effects when the crisis could not be saved", async () => {
    registerCrisisDefinition(forcing);
    const { db } = makeDb([liveCrisis({ forced: { streaks: { strike: 1 }, fired: [] } })], true);
    await processCrisisV2Turn(db, 10);
    expect(runForcedEvents).not.toHaveBeenCalled();
  });
});

describe("electoral consequences", () => {
  beforeEach(() => registerCrisisDefinition(makeDefinition()));

  it("settles the ledger once, on entering the aftermath", async () => {
    const { db, bulkWrite } = makeDb([
      liveCrisis({ stage: "aftermath", stageStartTurn: 4, severity: 40 }),
    ]);
    await processCrisisV2Turn(db, 10);
    expect(writtenSet(bulkWrite)[0].v2.consequencesSettled).toBe(true);
    expect(settleCrisisConsequences).toHaveBeenCalledTimes(1);
  });

  it("does not settle a second time or before the aftermath", async () => {
    const { db } = makeDb([
      liveCrisis({
        stage: "aftermath",
        stageStartTurn: 4,
        severity: 40,
        consequencesSettled: true,
      }),
      liveCrisis({ stage: "peak", severity: 80 }),
    ]);
    await processCrisisV2Turn(db, 10);
    expect(settleCrisisConsequences).not.toHaveBeenCalled();
  });

  it("settles a crisis that resolves without an aftermath", async () => {
    const { db } = makeDb([liveCrisis({ stage: "aftermath", severity: 5, stageStartTurn: 1 })]);
    await processCrisisV2Turn(db, 10);
    expect(settleCrisisConsequences).toHaveBeenCalledTimes(1);
  });
});

describe("blame follows exposure", () => {
  beforeEach(() => {
    registerCrisisDefinition(
      makeDefinition({
        scope: "state",
        levers: [
          { id: "hire", role: "stateGovernor", label: "Hire", mitigation: 2, cost: {} },
          { id: "ask", role: "partyLeader", label: "Whip", mitigation: 1, cost: {} },
        ],
      })
    );
    registerCrisisHolderProvider({
      id: "test",
      load: async () =>
        new Map([["US", { stateGovernor: ["gov-tx", "gov-oh"], partyLeader: ["leader"] }]]),
      loadFootprints: async () =>
        new Map([
          ["gov-tx", { stateId: "TX" }],
          ["gov-oh", { stateId: "OH" }],
        ]),
    });
  });

  it("blames only the governor of an affected state, and no party leader at state scope", async () => {
    const { db, bulkWrite } = makeDb([
      liveCrisis({ scope: "state", stage: "peak", severity: 70 }, "region"),
    ]);
    await processCrisisV2Turn(db, 10);
    const ledger = writtenSet(bulkWrite)[0].v2.ledger;
    expect(ledger.map((row) => row.holderId)).toEqual(["gov-tx"]);
  });

  it("blames every governor and the party leader when the whole country is hit", async () => {
    registerCrisisDefinition(
      makeDefinition({
        scope: "national",
        levers: [
          { id: "hire", role: "stateGovernor", label: "Hire", mitigation: 2, cost: {} },
          { id: "ask", role: "partyLeader", label: "Whip", mitigation: 1, cost: {} },
        ],
      })
    );
    const { db, bulkWrite } = makeDb([liveCrisis({ stage: "peak", severity: 70 })]);
    await processCrisisV2Turn(db, 10);
    expect(
      writtenSet(bulkWrite)[0]
        .v2.ledger.map((row) => row.holderId)
        .sort()
    ).toEqual(["gov-oh", "gov-tx", "leader"]);
  });
});
