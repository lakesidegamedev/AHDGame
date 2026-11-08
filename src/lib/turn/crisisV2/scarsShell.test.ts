import { ObjectId } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import type { CrisisScar } from "@/lib/crises/v2/types";

const routeEffectIntents = vi.hoisted(() => vi.fn(async () => ({ applied: 1, unsupported: {} })));
vi.mock("./intents", () => ({ routeEffectIntents }));
vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { processCrisisScars } from "./scarsShell";

const scar = (over: Partial<CrisisScar>): CrisisScar => ({
  ruleId: "r",
  kind: "creditStanding",
  targetId: "US",
  magnitude: 0.02,
  createdTurn: 10,
  recoveryTurns: 20,
  ...over,
});

function makeDb(scars: CrisisScar[], claimMatches = true) {
  const id = new ObjectId();
  const writes: { op: string; filter: unknown; update?: unknown }[] = [];
  const saved: { update: unknown }[] = [];
  let token = "";
  const db = {
    collection(name: string) {
      if (name === "states") {
        return {
          find: () => ({
            toArray: async () => [
              { _id: "TX", countryId: "US" },
              { _id: "OH", countryId: "US" },
            ],
          }),
        };
      }
      return {
        find: (filter: Record<string, unknown>) => ({
          toArray: async () => {
            if ("v2.scarClaim" in filter)
              return claimMatches && token ? [{ _id: id, v2: { scars } }] : [];
            return [{ _id: id }];
          },
        }),
        updateMany: async (filter: unknown, update: { $set: Record<string, string> }) => {
          token = update.$set["v2.scarClaim"];
          writes.push({ op: "claim", filter, update });
        },
        bulkWrite: async (ops: { updateOne: { update: unknown } }[]) => {
          for (const op of ops) saved.push(op.updateOne);
        },
      };
    },
  };
  return { db: db as never, writes, saved };
}

describe("processCrisisScars", () => {
  it("claims the turn, then writes the loss as a difference to the owning system", async () => {
    routeEffectIntents.mockClear();
    const { db, writes, saved } = makeDb([scar({})]);
    const result = await processCrisisScars(db, 10);
    expect(result).toEqual({ advanced: 1, failed: 0 });
    expect(writes[0].update).toMatchObject({ $set: { "v2.lastScarTurn": 10 } });
    const [, intents, targets] = routeEffectIntents.mock.calls[0] as unknown as [
      unknown,
      { kind: string; deltaBps: number }[],
      { countryIds: string[] },
    ];
    expect(intents[0]).toMatchObject({ kind: "bondYield" });
    expect(intents[0].deltaBps).toBeCloseTo(200);
    expect(targets.countryIds).toEqual(["US"]);
    const update = saved[0].update as { $set: { "v2.scars": CrisisScar[] } };
    expect(update.$set["v2.scars"][0].applied).toBeCloseTo(0.02);
  });

  it("heals by writing the opposite sign as the scar recovers", async () => {
    routeEffectIntents.mockClear();
    const { db } = makeDb([scar({ applied: 0.02 })]);
    await processCrisisScars(db, 20);
    const intents = (
      routeEffectIntents.mock.calls[0] as unknown as [unknown, { deltaBps: number }[]]
    )[1];
    expect(intents[0].deltaBps).toBeCloseTo(-100);
  });

  it("does nothing when another run already claimed the turn", async () => {
    routeEffectIntents.mockClear();
    const { db } = makeDb([scar({})], false);
    expect(await processCrisisScars(db, 10)).toEqual({ advanced: 0, failed: 0 });
    expect(routeEffectIntents).not.toHaveBeenCalled();
  });

  it("maps trust to approval and population to migration", async () => {
    routeEffectIntents.mockClear();
    const { db } = makeDb([
      scar({ kind: "institutionalTrust", magnitude: 0.01 }),
      scar({ kind: "population", targetId: "TX", magnitude: 0.01, ruleId: "p" }),
      scar({ kind: "regionalOutput", ruleId: "o" }),
    ]);
    await processCrisisScars(db, 10);
    const kinds = routeEffectIntents.mock.calls.map(
      (call) => (call as unknown as [unknown, { kind: string; delta?: number }[]])[1][0]
    );
    expect(kinds).toHaveLength(2);
    expect(kinds[0]).toMatchObject({ kind: "approval" });
    expect(kinds[0].delta).toBeCloseTo(-1);
    expect(kinds[1]).toMatchObject({ kind: "migration" });
  });
});
