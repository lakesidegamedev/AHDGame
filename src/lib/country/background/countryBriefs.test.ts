import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Db } from "mongodb";

vi.mock("@/lib/news", () => ({ createSystemNewsPost: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/wireEvent", () => ({ logWireEvent: vi.fn().mockResolvedValue(undefined) }));

import { createSystemNewsPost } from "@/lib/news";
import { logWireEvent } from "@/lib/wireEvent";
import { COUNTRY_BRIEF_INTERVAL_TURNS, processCountryBriefs } from "./countryBriefs";

type Row = Record<string, unknown>;

function world(macro: Row, bondGroups: Row[] = []) {
  const bondAggregate = vi.fn((_pipeline: unknown[]) => ({
    toArray: vi.fn(async () => bondGroups),
  }));
  const briefs: Row[] = [];
  let memory: unknown = macro.briefMemory;
  const cursor = (rows: Row[]) => ({ toArray: vi.fn(async () => rows) });
  const db = {
    collection: vi.fn((name: string) => {
      switch (name) {
        case "macroCountries":
          return {
            find: vi.fn(() => cursor([{ ...macro, briefMemory: memory }])),
            bulkWrite: vi.fn(async (ops: { updateOne: { update: { $set: Row } } }[]) => {
              memory = ops[0].updateOne.update.$set.briefMemory;
            }),
          };
        case "federalBudget":
          return {
            find: vi.fn(() => cursor([{ _id: "FR", creditRating: "AA", debtToGdpRatio: 0.9 }])),
          };
        case "exchangeRates":
          return { find: vi.fn(() => cursor([{ _id: "FR", currencyCode: "EUR", rate: 1 }])) };
        case "bonds":
          return { aggregate: bondAggregate };
        case "indexFunds":
          return { find: vi.fn(() => cursor([])) };
        case "countryBriefs":
          return {
            bulkWrite: vi.fn(
              async (ops: { updateOne: { filter: Row; update: { $setOnInsert: Row } } }[]) => {
                const upsertedIds: Record<number, string> = {};
                ops.forEach((op, i) => {
                  if (briefs.some((b) => b._id === op.updateOne.filter._id)) return;
                  briefs.push(op.updateOne.update.$setOnInsert);
                  upsertedIds[i] = String(op.updateOne.filter._id);
                });
                return { upsertedIds };
              }
            ),
          };
        default:
          throw new Error(`unexpected collection ${name}`);
      }
    }),
  } as unknown as Db;
  return { db, briefs, bondAggregate, memory: () => memory };
}

const FRANCE: Row = {
  entityId: "FR",
  displayName: "France",
  simulationTier: "background-macro",
  dataQuality: { provenance: "authored-2027" },
  nationalFiscal: {
    interestSpiralYears: 0,
    lastPackage: {
      turn: 290,
      fiscalYear: 2029,
      sizeGdpShare: 0.014,
      taxRise: 0.006,
      spendingCut: 0.008,
      approvalCost: 3,
    },
  },
};

beforeEach(() => vi.clearAllMocks());

describe("processCountryBriefs", () => {
  it("does nothing off the cadence", async () => {
    const w = world(FRANCE);
    expect(await processCountryBriefs(w.db, COUNTRY_BRIEF_INTERVAL_TURNS + 1)).toEqual({
      countries: 0,
      briefs: 0,
    });
    expect(w.db.collection).not.toHaveBeenCalled();
  });

  it("records the first look silently, then reports a package once", async () => {
    const w = world({
      ...FRANCE,
      nationalFiscal: { ...(FRANCE.nationalFiscal as Row), lastPackage: null },
    });
    const first = await processCountryBriefs(w.db, 300);
    expect(first).toEqual({ countries: 1, briefs: 0 });
    expect(w.memory()).toMatchObject({ rating: "AA", packageTurn: null });

    // A package lands before the next look.
    const w2 = world({
      ...FRANCE,
      briefMemory: w.memory(),
    });
    const second = await processCountryBriefs(w2.db, 306);
    expect(second.briefs).toBe(1);
    expect(w2.briefs[0]).toMatchObject({ _id: "FR:austerity:306", kind: "austerity" });
    expect(logWireEvent).toHaveBeenCalledWith("country_brief", expect.any(String), {
      href: "/country/fr",
    });
    expect(createSystemNewsPost).toHaveBeenCalledWith(
      expect.stringContaining("/country/fr"),
      "sovereign",
      expect.objectContaining({ db: w2.db })
    );

    // The same turn retried posts nothing new.
    const retry = await processCountryBriefs(w2.db, 306);
    expect(retry.briefs).toBe(0);
    expect(logWireEvent).toHaveBeenCalledTimes(1);
  });

  it("reads the nearest bond per country with one grouped query", async () => {
    const w = world(FRANCE, [{ _id: "FR", couponRate: 3, marketPrice: 98 }]);
    await processCountryBriefs(w.db, 300);
    expect(w.bondAggregate).toHaveBeenCalledTimes(1);
    const pipeline = w.bondAggregate.mock.calls[0]![0] as Record<string, any>[];
    expect(pipeline.map((stage) => Object.keys(stage)[0])).toEqual(["$match", "$sort", "$group"]);
    expect(pipeline[2]!.$group._id).toBe("$countryId");
    expect(pipeline[2]!.$group.couponRate).toEqual({ $first: "$couponRate" });
  });
});
