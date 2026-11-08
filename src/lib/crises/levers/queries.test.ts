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

function makeDb(opts: { stage?: "onset" | "resolved"; pulls?: unknown[]; country?: string } = {}) {
  const instance = {
    ...createCrisisInstance(makeDefinition(), 0),
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
      };
      return {
        findOne: async () =>
          name === "characters"
            ? { _id: characterId, countryId: opts.country ?? "US", currentOffice: null }
            : null,
        find: () => ({ toArray: async () => rows[name] ?? [] }),
      };
    },
  };
  return { db: db as never, reads };
}

beforeEach(() => {
  resetCrisisV2RegistryForTests();
  registerCrisisDefinition(makeDefinition());
  roles.derived = ["any", "headOfState"];
});

describe("getAvailableLevers", () => {
  it("lists only the levers the viewer's roles allow", async () => {
    const { db } = makeDb();
    const result = await getAvailableLevers(db, characterId);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      crisisId: crisisId.toString(),
      stage: "onset",
      severity: 40,
    });
    expect(result[0].levers.map((lever) => lever.id)).toEqual(["stimulus"]);
  });

  it("flags legislature levers as going through a bill", async () => {
    roles.derived = ["any"];
    const { db } = makeDb();
    const legislator = {
      collection: (name: string) => {
        const base = (db as { collection: (n: string) => Record<string, unknown> }).collection(
          name
        );
        return name === "congressLeaders"
          ? { ...base, findOne: async () => ({ _id: new ObjectId() }) }
          : base;
      },
    };
    const result = await getAvailableLevers(legislator as never, characterId);
    expect(result[0].levers).toEqual([
      expect.objectContaining({ id: "relief-bill", viaBill: true }),
    ]);
  });

  it("hides a lever on cooldown, counting pulls the turn phase has not seen yet", async () => {
    const { db } = makeDb({
      pulls: [{ crisisId, leverId: "stimulus", submittedTurn: 9 }],
    });
    expect(await getAvailableLevers(db, characterId)).toEqual([]);
  });

  it("returns nothing for a holder in another country or a resolved crisis", async () => {
    expect(await getAvailableLevers(makeDb({ country: "DE" }).db, characterId)).toEqual([]);
    expect(await getAvailableLevers(makeDb({ stage: "resolved" }).db, characterId)).toEqual([]);
  });

  it("does no per-crisis queries", async () => {
    const { db, reads } = makeDb();
    await getAvailableLevers(db, characterId);
    expect(reads.filter((name) => name === "crises")).toHaveLength(1);
    expect(reads.filter((name) => name === "crisisLeverUses")).toHaveLength(1);
  });
});
