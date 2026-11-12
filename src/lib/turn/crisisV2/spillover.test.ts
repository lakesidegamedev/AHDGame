import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCrisisInstance } from "@/lib/crises/v2/instance";
import { makeDefinition } from "@/lib/crises/v2/testFixtures";
import type { CrisisInstance } from "@/lib/crises/v2/types";
import { legacyDefinitionId } from "@/lib/crises/v2/legacyConvert";
import { SPILLOVER_FALLBACK_DURATION_TURNS } from "@/lib/crises/v2/spilloverShell";
import { ALL_CRISIS_TEMPLATES } from "@/lib/crises/templates";
import { registerCrisisDefinition, resetCrisisV2RegistryForTests } from "./registry";

vi.mock("@/lib/country/countryTier", () => ({
  loadCountryTiers: async () => ({
    tierOf: (id: string) => (id === "BG" ? "background" : "npp"),
    registeredIds: ["BG", "DE", "UK"],
    backgroundIds: ["BG"],
  }),
}));
vi.mock("@/lib/wireEvent", () => ({ logWireEvent: vi.fn() }));
vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));

import { runCrisisSpillover } from "./spillover";

interface Doc {
  _id: ObjectId;
  scope: string;
  countryIds: string[];
  regionIds: string[];
  v2: CrisisInstance;
}

function makeDb(docs: Doc[], writes: { inserted: Doc[]; bulk: unknown[] }) {
  const snapshot = {
    commodities: { oil: { flow: { BG: { UK: 100 }, DE: { UK: 100 } } } },
  };
  return {
    collection(name: string) {
      return {
        find: () => ({
          toArray: async () =>
            name === "macroCountries" ? [{ entityId: "BG", population: 10 }] : docs,
        }),
        findOne: async () => (name === "tradeFlowSnapshots" ? snapshot : null),
        insertMany: async (rows: Doc[]) => void writes.inserted.push(...rows),
        bulkWrite: async (ops: unknown[]) => void writes.bulk.push(...ops),
      };
    },
  };
}

const SOURCE_DEF = makeDefinition({
  id: "source",
  spillover: [
    {
      id: "trade",
      channel: "trade",
      targetDefinitionId: "target",
      minSeverity: 30,
      transmission: 1,
    },
  ],
});

function sourceDoc(country: string, severity: number): Doc {
  return {
    _id: new ObjectId(),
    scope: "country",
    countryIds: [country],
    regionIds: [],
    v2: { ...createCrisisInstance(SOURCE_DEF, 1), stage: "peak", severity },
  };
}

describe("spillover shell", () => {
  beforeEach(() => {
    resetCrisisV2RegistryForTests();
    registerCrisisDefinition(SOURCE_DEF);
    registerCrisisDefinition(makeDefinition({ id: "target", scope: "national" }));
  });

  it("opens the target definition and records parent and child ids", async () => {
    const source = sourceDoc("DE", 80);
    const writes = { inserted: [] as Doc[], bulk: [] as unknown[] };
    const result = await runCrisisSpillover(makeDb([source], writes) as never, 20);
    expect(result.opened).toBe(1);
    const child = writes.inserted[0];
    expect(child.countryIds).toEqual(["UK"]);
    expect(child.v2.parents).toEqual([
      { crisisId: source._id.toString(), definitionId: "source", linkId: "trade" },
    ]);
    expect(JSON.stringify(writes.bulk)).toContain(child._id.toString());
  });

  it("gives a spilled scripted crisis a finite length so it can end", async () => {
    registerCrisisDefinition(
      makeDefinition({
        id: "target",
        scope: "national",
        pacing: { kind: "scripted", durationTurns: null },
      })
    );
    const writes = { inserted: [] as Doc[], bulk: [] as unknown[] };
    await runCrisisSpillover(makeDb([sourceDoc("DE", 80)], writes) as never, 20);
    const child = writes.inserted[0] as Doc & { durationTurns: number | null };
    expect(child.durationTurns).toBe(SPILLOVER_FALLBACK_DURATION_TURNS);
  });

  it("carries the authored length and effects of a legacy target template", async () => {
    const key = "banking_crisis";
    const template = (ALL_CRISIS_TEMPLATES as Record<string, { effects: unknown[] }>)[key];
    registerCrisisDefinition(
      makeDefinition({
        id: legacyDefinitionId(key),
        scope: "national",
        pacing: { kind: "scripted", durationTurns: 36 },
      })
    );
    registerCrisisDefinition(
      makeDefinition({
        ...SOURCE_DEF,
        spillover: [
          {
            id: "trade",
            channel: "trade",
            targetDefinitionId: legacyDefinitionId(key),
            minSeverity: 30,
            transmission: 1,
          },
        ],
      })
    );
    const writes = { inserted: [] as Doc[], bulk: [] as unknown[] };
    await runCrisisSpillover(makeDb([sourceDoc("DE", 80)], writes) as never, 20);
    const child = writes.inserted[0] as Doc & {
      durationTurns: number | null;
      effects: unknown[];
      templateKey?: string;
    };
    expect(child.durationTurns).toBe(36);
    expect(child.effects).toEqual(template.effects);
    expect(child.effects.length).toBeGreaterThan(0);
    expect(child.templateKey).toBe(key);
  });

  it("treats a background country as a source of spillover", async () => {
    const writes = { inserted: [] as Doc[], bulk: [] as unknown[] };
    await runCrisisSpillover(makeDb([sourceDoc("BG", 60)], writes) as never, 20);
    expect(writes.inserted).toHaveLength(1);
    expect(writes.inserted[0].countryIds).toEqual(["UK"]);
  });

  it("feeds an existing crisis in the linked country", async () => {
    const source = sourceDoc("DE", 80);
    const target: Doc = {
      _id: new ObjectId(),
      scope: "country",
      countryIds: ["UK"],
      regionIds: [],
      v2: { ...createCrisisInstance(makeDefinition({ id: "target" }), 1), severity: 10 },
    };
    const writes = { inserted: [] as Doc[], bulk: [] as unknown[] };
    const result = await runCrisisSpillover(makeDb([source, target], writes) as never, 20);
    expect(result.opened).toBe(0);
    expect(writes.inserted).toHaveLength(0);
    expect(JSON.stringify(writes.bulk)).toContain('"v2.severity":14');
  });
});
