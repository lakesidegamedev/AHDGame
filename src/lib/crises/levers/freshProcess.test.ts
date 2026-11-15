import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCrisisInstance } from "@/lib/crises/v2/instance";
import { makeDefinition } from "@/lib/crises/v2/testFixtures";
import {
  registerCrisisDefinition,
  resetCrisisV2RegistryForTests,
} from "@/lib/turn/crisisV2/registry";

const roles = vi.hoisted(() => ({ derived: [] as string[] }));
vi.mock("@/lib/gameState", () => ({ getGameState: async () => ({ currentTurn: 10 }) }));
vi.mock("@/lib/crises/interactionEngine", () => ({
  resolveCharacterRoles: async () => roles.derived,
}));

import { getAvailableLevers } from "./queries";

const characterId = new ObjectId();
const crisisId = new ObjectId();

function makeDb(
  opts: {
    stage?: "onset" | "resolved";
    pulls?: unknown[];
    country?: string;
    aidNode?: object;
    definitionId?: string;
  } = {}
) {
  const instance = {
    ...createCrisisInstance(makeDefinition(), 0),
    definitionId: opts.definitionId ?? makeDefinition().id,
    stage: opts.stage ?? "onset",
    severity: 40,
  };
  const reads: string[] = [];
  const db = {
    collection(name: string) {
      reads.push(name);
      const rows: Record<string, unknown[]> = {
        characters: [],
        crises: [
          { _id: crisisId, scope: "country", countryIds: ["US"], regionIds: [], v2: instance },
        ],
        corporations: [],
        crisisLeverUses: opts.pulls ?? [],
        congressLeaders: [],
        crisisInteractions: [{ crisisId, decisionTree: [opts.aidNode ?? { type: "aid" }] }],
      };
      return {
        findOne: async () =>
          name === "characters"
            ? { _id: characterId, countryId: opts.country ?? "US", currentOffice: null }
            : name === "federalBudget"
              ? { gdp: 900, gdpSmoothed: 1_000, currencyCode: "USD" }
              : null,
        find: () => ({ toArray: async () => rows[name] ?? [] }),
      };
    },
  };
  return { db: db as never, reads };
}

import { recessionDefinition } from "@/lib/crises/v2/definitions/emergent/recession";
beforeEach(() => {
  resetCrisisV2RegistryForTests();
  roles.derived = ["any", "headOfState"];
});
describe("crisis responses in a process that never ran the worker", () => {
  it("serves built-in recession responses in a fresh web process", async () => {
    const { db } = makeDb({ definitionId: recessionDefinition.id });
    expect(await getAvailableLevers(db, characterId)).toHaveLength(1);
  });
  it("keeps working after the registry is reset and asked again", async () => {
    const { db } = makeDb({ definitionId: recessionDefinition.id });
    expect(await getAvailableLevers(db, characterId)).toHaveLength(1);
    resetCrisisV2RegistryForTests();
    expect(await getAvailableLevers(db, characterId)).toHaveLength(1);
  });
  it("hides a pooled response behind a node gate that excludes the viewer", async () => {
    const def = makeDefinition();
    registerCrisisDefinition({
      ...def,
      levers: [
        {
          id: "pool.aid",
          role: "headOfState",
          label: "Aid",
          mitigation: 4,
          cost: {},
          legacy: { kind: "aid", nodeId: "aid" },
        },
      ],
    });
    const { db } = makeDb({
      country: "DE",
      aidNode: { nodeId: "aid", type: "aid", requiredCountryIds: ["FR"] },
    });
    expect(await getAvailableLevers(db, characterId)).toHaveLength(0);
  });
  it("offers foreign aid to a foreign head of state", async () => {
    const def = makeDefinition();
    registerCrisisDefinition({
      ...def,
      levers: [
        {
          id: "pool.aid",
          role: "headOfState",
          label: "Aid",
          mitigation: 4,
          cost: {},
          legacy: { kind: "aid", nodeId: "aid" },
        },
      ],
    });
    const { db } = makeDb({ country: "DE", aidNode: { nodeId: "aid", type: "aid" } });
    expect(await getAvailableLevers(db, characterId)).toHaveLength(1);
  });
  it("serves the available-responses route from a fresh module graph", async () => {
    vi.resetModules();
    const { db } = makeDb({ definitionId: recessionDefinition.id });
    vi.doMock("@/lib/api/requireAuth", () => ({
      requireAuthWithCharacter: async () => ({
        ok: true,
        user: { character: { _id: characterId } },
      }),
    }));
    vi.doMock("@/lib/mongodb", () => ({ getDb: async () => db }));
    const { GET } = await import("@/app/api/crises/levers/available/route");
    const body = (await (await GET()).json()) as { crises: { levers: unknown[] }[] };
    expect(body.crises).toHaveLength(1);
    expect(body.crises[0].levers.length).toBeGreaterThan(0);
    vi.doUnmock("@/lib/api/requireAuth");
    vi.doUnmock("@/lib/mongodb");
  });
});
