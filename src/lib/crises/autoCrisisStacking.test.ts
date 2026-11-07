import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import type { CrisisAutoCooldown } from "@/lib/db/types/crisis";

const mocks = vi.hoisted(() => ({
  severeLoad: new Map<string, number>(),
  conditionHolds: false,
}));

vi.mock("./templates", () => {
  const base = {
    description: "",
    heroImage: "",
    scope: "country",
    countryIds: [],
    regionIds: [],
    durationTurns: 4,
    effects: [],
    wireMessageOnStart: "",
    wireMessageOnEnd: "",
  };
  return {
    getTemplateDuration: () => null,
    ALL_CRISIS_TEMPLATES: {
      sure_crisis: {
        ...base,
        name: "Sure crisis",
        autoTrigger: { kind: "random", cooldownTurns: 100, scope: "country", spawnChance: 1 },
      },
      never_crisis: {
        ...base,
        name: "Never crisis",
        autoTrigger: { kind: "random", cooldownTurns: 100, scope: "country", spawnChance: 0 },
      },
      metric_crisis: {
        ...base,
        name: "Metric crisis",
        autoTrigger: { kind: "condition", cooldownTurns: 100, condition: { all: [] } },
      },
      sure_opportunity: {
        ...base,
        name: "Sure opportunity",
        opportunity: true,
        autoTrigger: { kind: "random", cooldownTurns: 100, scope: "country", spawnChance: 1 },
      },
    },
  };
});
vi.mock("@/lib/countryAccess", () => ({ getSimulatedCountryIds: async () => ["US"] }));
vi.mock("./vietnamEscalationInterface", () => ({ refreshVietnamEscalationLevel: async () => {} }));
vi.mock("./marketAdjustment/signals", () => ({
  marketAdjustmentEnabled: async () => false,
  recordLossShares: async () => {},
}));
vi.mock("./marketAdjustment/worldHeadline", () => ({ syncWorldHeadline: async () => {} }));
vi.mock("./autoCrisisConditions", () => ({
  loadNationalSnapshot: async () => ({}),
  evaluateCondition: () => mocks.conditionHolds,
  conditionCleared: () => false,
}));
vi.mock("./createCrisisFromTemplate", () => ({ createCrisisFromTemplate: vi.fn(async () => {}) }));
vi.mock("./severeCrisisLoad", () => ({
  loadCountrySevereLoad: async () => new Map(mocks.severeLoad),
}));

import { processAutoCrisisSpawn } from "./autoCrisisSpawn";
import { createCrisisFromTemplate } from "./createCrisisFromTemplate";

const created = vi.mocked(createCrisisFromTemplate);

function spawnedNames(): string[] {
  return created.mock.calls.map(([, params]) => params.template.name);
}

function cooldownWrites(db: MockDb): Array<[unknown, Record<string, Record<string, unknown>>]> {
  return (db.collectionMocks.crisisAutoCooldowns?.updateOne.mock.calls ?? []) as Array<
    [unknown, Record<string, Record<string, unknown>>]
  >;
}

let db: MockDb;

function withCooldowns(rows: CrisisAutoCooldown[]): void {
  db.collection("crisisAutoCooldowns").find.mockReturnValue({
    toArray: vi.fn().mockResolvedValue(rows),
  });
}

beforeEach(() => {
  created.mockClear();
  mocks.severeLoad = new Map();
  mocks.conditionHolds = false;
  db = createMockDb();
  db.collection("gameState").findOne.mockResolvedValue({ _id: "current", currentYear: 2030 });
});

describe("cross-system stacking guard in the auto-crisis spawner", () => {
  it("spawns a severe crisis while the country has a free slot", async () => {
    mocks.severeLoad = new Map([["US", 1]]);
    await processAutoCrisisSpawn(db as unknown as Db, 500);
    expect(spawnedNames()).toEqual(["Sure crisis"]);
  });

  it("defers a third severe crisis instead of spawning or dropping it", async () => {
    mocks.severeLoad = new Map([["US", 2]]);
    await processAutoCrisisSpawn(db as unknown as Db, 500);
    expect(spawnedNames()).toEqual(["Sure opportunity"]);
    const deferral = cooldownWrites(db).find(([filter]) => {
      return (filter as { _id: string })._id === "sure_crisis:US";
    });
    expect(deferral?.[1].$set?.deferredTurn).toBe(500);
    // Not stamped: the deferral is not a spawn, so no cooldown starts.
    expect(deferral?.[1].$set?.lastSpawnTurn).toBeUndefined();
    expect(deferral?.[1].$setOnInsert?.lastSpawnTurn).toBe(400);
  });

  it("lands a deferred crisis without re-rolling once a slot frees", async () => {
    mocks.severeLoad = new Map([["US", 1]]);
    withCooldowns([
      {
        _id: "never_crisis:US",
        templateKey: "never_crisis",
        scopeKey: "US",
        lastSpawnTurn: 0,
        armed: true,
        deferredTurn: 480,
        updatedAt: new Date(0),
      },
      {
        _id: "sure_crisis:US",
        templateKey: "sure_crisis",
        scopeKey: "US",
        lastSpawnTurn: 450,
        updatedAt: new Date(0),
      },
    ]);
    await processAutoCrisisSpawn(db as unknown as Db, 500);
    // never_crisis has a zero chance; only its stored deferral can spawn it.
    expect(spawnedNames()).toEqual(["Never crisis"]);
    const stamp = cooldownWrites(db).find(
      ([filter]) => (filter as { _id: string })._id === "never_crisis:US"
    );
    expect(stamp?.[1].$set?.lastSpawnTurn).toBe(500);
    expect(stamp?.[1].$unset).toEqual({ deferredTurn: "" });
  });

  it("keeps a deferred crisis waiting while the country is still full", async () => {
    mocks.severeLoad = new Map([["US", 2]]);
    withCooldowns([
      {
        _id: "never_crisis:US",
        templateKey: "never_crisis",
        scopeKey: "US",
        lastSpawnTurn: 0,
        deferredTurn: 480,
        updatedAt: new Date(0),
      },
      {
        _id: "sure_crisis:US",
        templateKey: "sure_crisis",
        scopeKey: "US",
        lastSpawnTurn: 450,
        updatedAt: new Date(0),
      },
      {
        _id: "sure_opportunity:US",
        templateKey: "sure_opportunity",
        scopeKey: "US",
        lastSpawnTurn: 450,
        updatedAt: new Date(0),
      },
    ]);
    await processAutoCrisisSpawn(db as unknown as Db, 500);
    expect(spawnedNames()).toEqual([]);
    // The original deferral turn is kept; nothing is rewritten.
    expect(
      cooldownWrites(db).filter(([filter]) => (filter as { _id: string })._id === "never_crisis:US")
    ).toEqual([]);
  });

  it("holds a condition crisis armed and off cooldown until a slot frees", async () => {
    mocks.conditionHolds = true;
    mocks.severeLoad = new Map([["US", 2]]);
    await processAutoCrisisSpawn(db as unknown as Db, 500);
    expect(spawnedNames()).not.toContain("Metric crisis");
    expect(
      cooldownWrites(db).filter(
        ([filter]) => (filter as { _id: string })._id === "metric_crisis:US"
      )
    ).toEqual([]);

    created.mockClear();
    mocks.severeLoad = new Map([["US", 1]]);
    await processAutoCrisisSpawn(db as unknown as Db, 501);
    expect(spawnedNames()).toEqual(["Metric crisis"]);
  });

  it("never holds back an opportunity", async () => {
    mocks.severeLoad = new Map([["US", 5]]);
    withCooldowns([
      {
        _id: "sure_crisis:US",
        templateKey: "sure_crisis",
        scopeKey: "US",
        lastSpawnTurn: 450,
        updatedAt: new Date(0),
      },
    ]);
    await processAutoCrisisSpawn(db as unknown as Db, 500);
    expect(spawnedNames()).toEqual(["Sure opportunity"]);
  });
});
