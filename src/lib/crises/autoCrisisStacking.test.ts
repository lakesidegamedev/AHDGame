import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";

const mocks = vi.hoisted(() => ({
  allow: true,
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
vi.mock("./spawnDirector", () => ({
  createSpawnDirector: async () => ({ allow: () => mocks.allow }),
  directorScopeFor: () => "national",
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

beforeEach(() => {
  created.mockClear();
  mocks.allow = true;
  mocks.conditionHolds = false;
  db = createMockDb();
  db.collection("gameState").findOne.mockResolvedValue({ _id: "current", currentYear: 2030 });
});

describe("director budget in the auto-crisis spawner", () => {
  it("spawns crises the budget admits and passes the template key along", async () => {
    await processAutoCrisisSpawn(db as unknown as Db, 500);
    expect(spawnedNames()).toContain("Sure crisis");
    const params = created.mock.calls.find(([, p]) => p.template.name === "Sure crisis")?.[1];
    expect(params?.templateKey).toBe("sure_crisis");
  });

  it("holds back a crisis the budget refuses without starting its cooldown", async () => {
    mocks.allow = false;
    await processAutoCrisisSpawn(db as unknown as Db, 500);
    expect(spawnedNames()).toEqual(["Sure opportunity"]);
    expect(
      cooldownWrites(db).filter(([filter]) => (filter as { _id: string })._id === "sure_crisis:US")
    ).toEqual([]);
  });

  it("holds a condition crisis armed and off cooldown until the budget fits", async () => {
    mocks.conditionHolds = true;
    mocks.allow = false;
    await processAutoCrisisSpawn(db as unknown as Db, 500);
    expect(spawnedNames()).not.toContain("Metric crisis");
    expect(
      cooldownWrites(db).filter(
        ([filter]) => (filter as { _id: string })._id === "metric_crisis:US"
      )
    ).toEqual([]);

    created.mockClear();
    mocks.allow = true;
    await processAutoCrisisSpawn(db as unknown as Db, 501);
    expect(spawnedNames()).toContain("Metric crisis");
  });

  it("never holds back an opportunity", async () => {
    mocks.allow = false;
    await processAutoCrisisSpawn(db as unknown as Db, 500);
    expect(spawnedNames()).toEqual(["Sure opportunity"]);
  });
});
