import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCrisisInstance } from "@/lib/crises/v2/instance";
import { makeDefinition } from "@/lib/crises/v2/testFixtures";
import type { CrisisInstance } from "@/lib/crises/v2/types";
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
