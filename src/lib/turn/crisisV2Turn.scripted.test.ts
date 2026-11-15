import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CrisisEffect } from "@/lib/db/types/crisis";
import type { CrisisInstance } from "@/lib/crises/v2/types";
import { createCrisisInstance } from "@/lib/crises/v2/instance";
import { legacyDefinitionId } from "@/lib/crises/v2/legacyConvert";

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() }));
const applyCrisisTurnEffects = vi.hoisted(() => vi.fn(async () => {}));
const finalizeResolvedCrises = vi.hoisted(() => vi.fn(async () => {}));
const applyCrisisEffects = vi.hoisted(() => vi.fn());

vi.mock("@/lib/observability/logger", () => ({ logger }));
vi.mock("@/lib/crises/applyEffects", () => ({ applyCrisisEffects }));
vi.mock("@/lib/wireEvent", () => ({ logWireEvent: vi.fn() }));
vi.mock("@/lib/gameState", () => ({
  getGameState: async () => ({ currentYear: 2030 }),
}));
vi.mock("./crisisTurn", () => ({ applyCrisisTurnEffects, finalizeResolvedCrises }));

import { processCrisisV2Turn } from "./crisisV2Turn";
import { resetCrisisV2RegistryForTests } from "./crisisV2/registry";
import {
  ensureLegacyCrisisContent,
  legacyDefinitionFor,
  resetLegacyCrisisContentForTests,
} from "./crisisV2/legacyContent";

const TICK: CrisisEffect = {
  effectType: "tick",
  targetType: "metric",
  metricCategory: "economy",
  metricField: "gdp",
  sectorType: null,
  strategyId: null,
  value: -2,
  label: "Drag",
};
const FLAT: CrisisEffect = { ...TICK, effectType: "flat", value: -5, label: "Shock" };
const DECAY: CrisisEffect = { ...TICK, effectType: "decay", value: -9, label: "Margin" };

function makeDb(crises: Record<string, unknown>[]) {
  const bulkWrite = vi.fn(async () => ({}));
  const cursor = (rows: unknown[]) => ({ toArray: async () => rows });
  const db = {
    collection(name: string) {
      return {
        find() {
          if (name === "crises") return cursor(crises);
          if (name === "states") return cursor([{ _id: "s1", countryId: "US" }]);
          return cursor([]);
        },
        bulkWrite,
        updateOne: vi.fn(async () => ({ matchedCount: 1 })),
        updateMany: vi.fn(),
        insertMany: vi.fn(),
      };
    },
  };
  return { db: db as never, bulkWrite };
}

function scriptedCrisis(durationTurns: number | null, startTurn = 0) {
  const def = legacyDefinitionFor("banking_crisis");
  const v2: CrisisInstance = createCrisisInstance(def, startTurn, { evaluateOnStart: true });
  return {
    _id: new ObjectId(),
    name: "Banking Crisis",
    scope: "country",
    countryIds: ["US"],
    regionIds: [],
    wireMessageOnEnd: "Over.",
    startTurn,
    durationTurns,
    effects: [FLAT, TICK, DECAY],
    v2,
  };
}

function writtenSet(bulkWrite: ReturnType<typeof makeDb>["bulkWrite"]) {
  const ops = (bulkWrite.mock.calls[0] as unknown as [unknown[]])[0] as {
    updateOne: { update: { $set: Record<string, unknown> & { v2: CrisisInstance } } };
  }[];
  return ops[0].updateOne.update.$set;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetCrisisV2RegistryForTests();
  resetLegacyCrisisContentForTests();
  ensureLegacyCrisisContent();
});

describe("scripted (converted template) crises in the v2 phase", () => {
  it("steps on the start turn and applies flat and tick effects through the legacy writers", async () => {
    const crisis = scriptedCrisis(24);
    const { db } = makeDb([crisis]);
    const result = await processCrisisV2Turn(db, 0);
    expect(result.processed).toBe(1);
    expect(applyCrisisTurnEffects).toHaveBeenCalledTimes(1);
    const applied = applyCrisisTurnEffects.mock.calls[0] as unknown as [
      unknown,
      unknown,
      CrisisEffect[],
    ];
    const effects = applied[2];
    expect(effects.map((e) => [e.effectType, e.value])).toEqual([
      ["flat", -5],
      ["tick", -2],
    ]);
  });

  it("ramps tick effects down over the crisis length and never applies decay", async () => {
    const crisis = scriptedCrisis(24);
    crisis.v2 = { ...crisis.v2, stage: "onset", severityHistory: [{ turn: 5, severity: 60 }] };
    const { db } = makeDb([crisis]);
    await processCrisisV2Turn(db, 12);
    const effects = (
      applyCrisisTurnEffects.mock.calls[0] as unknown as [unknown, unknown, CrisisEffect[]]
    )[2];
    expect(effects).toHaveLength(1);
    expect(effects[0].value).toBeCloseTo(-1);
  });

  it("walks the stages by elapsed time and hands the end to the shared finalizer", async () => {
    const crisis = scriptedCrisis(24);
    crisis.v2 = { ...crisis.v2, stage: "aftermath", severityHistory: [{ turn: 22, severity: 60 }] };
    const { db, bulkWrite } = makeDb([crisis]);
    const result = await processCrisisV2Turn(db, 24);
    expect(result.resolved).toBe(1);
    const set = writtenSet(bulkWrite);
    expect(set.v2.stage).toBe("resolved");
    // the finalizer, not this write, flips the lifecycle flag
    expect(set.status).toBeUndefined();
    expect(finalizeResolvedCrises).toHaveBeenCalledTimes(1);
    expect(applyCrisisTurnEffects).not.toHaveBeenCalled();
  });

  it("follows a stored length that was extended after spawn", async () => {
    const crisis = scriptedCrisis(40);
    crisis.v2 = { ...crisis.v2, stage: "aftermath", severityHistory: [{ turn: 29, severity: 60 }] };
    const { db, bulkWrite } = makeDb([crisis]);
    await processCrisisV2Turn(db, 30);
    expect(writtenSet(bulkWrite).v2.stage).not.toBe("resolved");
    expect(finalizeResolvedCrises).not.toHaveBeenCalled();
  });

  it("holds an indefinite crisis open", async () => {
    const crisis = scriptedCrisis(null);
    crisis.v2 = { ...crisis.v2, stage: "peak", severityHistory: [{ turn: 99, severity: 60 }] };
    const { db, bulkWrite } = makeDb([crisis]);
    await processCrisisV2Turn(db, 100);
    expect(writtenSet(bulkWrite).v2.stage).toBe("peak");
  });

  it("uses a definition id that matches the spawn path", () => {
    expect(scriptedCrisis(24).v2.definitionId).toBe(legacyDefinitionId("banking_crisis"));
  });
});
