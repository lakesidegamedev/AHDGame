import { describe, expect, it, vi } from "vitest";
import { ObjectId, type Db } from "mongodb";
import { createInMemoryDb, type InMemoryDb } from "@/lib/test-utils/inMemoryDb";
import { defect, mergeHolders } from "./AHD-sovereign-rollover-wall";
import type { HealContext } from "../types";

vi.mock("@/lib/db/runRequiredTransaction", () => ({
  runRequiredTransaction: async (body: (session: unknown) => Promise<unknown>) => body({} as never),
}));

const NOW = new Date("2026-11-04T00:00:00Z");
const corporationId = new ObjectId("650000000000000000000a01");
const fundA = new ObjectId("650000000000000000000f01");
const fundB = new ObjectId("650000000000000000000f02");
const ctx: HealContext = { env: "sandbox", dryRun: false, now: NOW, runId: "run_test" };

function bond(i: number, over: Record<string, unknown> = {}) {
  return {
    _id: new ObjectId(`6600000000000000000${String(i).padStart(5, "0")}`),
    issuerType: "sovereign",
    corporationId,
    countryId: "AT",
    issuerName: "Austria",
    currencyCode: "ATS",
    faceValue: 1_000,
    couponRate: 2.75,
    maturityTurns: 48,
    issuedAtTurn: 671,
    maturityTurn: 719,
    marketPrice: 1,
    totalIssued: 10_000,
    publicFloat: 8,
    holders: [{ fundId: fundA, units: 2, avgCostPerUnit: 990 }],
    defaulted: false,
    matured: false,
    restructureHaircutPercent: null,
    ...over,
  };
}

function world(): InMemoryDb {
  const memory = createInMemoryDb();
  memory.seed("gameState", [{ _id: "current", currentTurn: 680 }]);
  memory.seed("bonds", [
    bond(1),
    bond(2, { holders: [{ fundId: fundA, units: 4, avgCostPerUnit: 1_000 }], publicFloat: 6 }),
    bond(3, { holders: [{ fundId: fundB, units: 1 }], publicFloat: 9 }),
    // A different coupon is a different series.
    bond(4, { couponRate: 3 }),
    // A bank lot keeps its bond out of the fold.
    bond(5, {
      holders: [{ bankId: new ObjectId(), charteredTurn: 1, units: 2, bankTreasuryLotId: "lot" }],
    }),
    // A frozen maturity claim keeps its bond out of the fold.
    bond(6, { sovereignMaturityClaim: { id: "claim" } }),
    // Another issuer.
    bond(7, { countryId: "DE", issuerName: "Germany", currencyCode: "DEM" }),
    bond(8, { countryId: "DE", issuerName: "Germany", currencyCode: "DEM" }),
  ] as unknown as Record<string, unknown>[]);
  return memory;
}

function liveFace(memory: InMemoryDb) {
  const totals: Record<string, { face: number; float: number; holderUnits: number }> = {};
  for (const row of memory.collection("bonds").docs as Array<Record<string, unknown>>) {
    if (row.matured) continue;
    const key = String(row.countryId);
    const entry = (totals[key] ??= { face: 0, float: 0, holderUnits: 0 });
    entry.face += row.totalIssued as number;
    entry.float += row.publicFloat as number;
    entry.holderUnits += ((row.holders as Array<{ units: number }>) ?? []).reduce(
      (sum, holder) => sum + holder.units,
      0
    );
  }
  return totals;
}

describe(defect.id, () => {
  it("plans only the plain series, and moves no money", async () => {
    const memory = world();
    const db = memory as unknown as Db;
    const detected = await defect.detect(db, { ...ctx, dryRun: true });
    // AT 2.75 series: bonds 1-3 fold into 1 (two absorbed); DE: 7-8 (one).
    expect(detected.affected).toBe(3);
    const plan = await defect.plan(db, { ...ctx, dryRun: true });
    expect(plan.moneyDelta).toBe(0);
    expect(plan.touched[0]!.ids).toHaveLength(5);
  });

  it("does not flag a shared rollover bond beside one scheduled issuance of the same coupon and term", async () => {
    const memory = createInMemoryDb();
    memory.seed("gameState", [{ _id: "current", currentTurn: 740 }]);
    memory.seed("bonds", [
      // AT: one shared rollover bond plus one scheduled issuance is the intended shape.
      bond(11, { sovereignRolloverConsolidated: true }),
      bond(12),
      // DE: two shared rollover bonds for one series is a split.
      bond(13, {
        countryId: "DE",
        issuerName: "Germany",
        currencyCode: "DEM",
        sovereignRolloverConsolidated: true,
      }),
      bond(14, {
        countryId: "DE",
        issuerName: "Germany",
        currencyCode: "DEM",
        sovereignRolloverConsolidated: true,
      }),
      // FR: a shared bond plus two unconsolidated bonds is a split.
      bond(15, {
        countryId: "FR",
        issuerName: "France",
        currencyCode: "FRF",
        sovereignRolloverConsolidated: true,
      }),
      bond(16, { countryId: "FR", issuerName: "France", currencyCode: "FRF" }),
      bond(17, { countryId: "FR", issuerName: "France", currencyCode: "FRF" }),
    ] as unknown as Record<string, unknown>[]);
    const db = memory as unknown as Db;
    const detected = await defect.detect(db, { ...ctx, dryRun: true });
    expect(detected.affected).toBe(3);
    expect(
      (detected.sample as Array<{ countryId: string }>).map((row) => row.countryId).sort()
    ).toEqual(["DE", "FR"]);
  });

  it("folds each series into its oldest bond with face, float and positions conserved", async () => {
    const memory = world();
    const db = memory as unknown as Db;
    const before = liveFace(memory);
    const plan = await defect.plan(db, { ...ctx, dryRun: true });
    const result = await defect.apply(db, plan, ctx);
    expect(result.documentsUpdated).toBe(5);
    expect(liveFace(memory)).toEqual(before);

    const docs = memory.collection("bonds").docs as Array<Record<string, unknown>>;
    const byId = (i: number) => docs.find((row) => String(row._id) === String(bond(i)._id))!;
    expect(byId(1)).toMatchObject({ totalIssued: 30_000, publicFloat: 23, matured: false });
    expect(byId(1).holders).toEqual([
      { fundId: fundA, units: 6, avgCostPerUnit: (2 * 990 + 4 * 1_000) / 6 },
      { fundId: fundB, units: 1 },
    ]);
    for (const i of [2, 3, 8])
      expect(byId(i)).toMatchObject({
        totalIssued: 0,
        publicFloat: 0,
        holders: [],
        matured: true,
        consolidatedIntoBondId: i === 8 ? bond(7)._id : bond(1)._id,
      });
    for (const i of [4, 5, 6])
      expect(byId(i)).toMatchObject({ matured: false, totalIssued: 10_000 });

    const verified = await defect.verify(db, ctx);
    expect(verified).toMatchObject({ ok: true, remaining: 0 });
    // A second run finds nothing to do.
    const again = await defect.plan(db, { ...ctx, dryRun: true });
    expect(again.affected).toBe(0);
  });

  it("leaves a series alone when a member moved after the plan", async () => {
    const memory = world();
    const db = memory as unknown as Db;
    const plan = await defect.plan(db, { ...ctx, dryRun: true });
    const moved = memory
      .collection("bonds")
      .docs.find((row) => String(row._id) === String(bond(2)._id))!;
    moved.publicFloat = 5;
    moved.holders = [{ fundId: fundA, units: 5 }];
    const before = liveFace(memory);
    const result = await defect.apply(db, plan, ctx);
    expect(result.notes?.join(" ")).toContain("moved after the plan");
    expect(liveFace(memory)).toEqual(before);
    // The DE series still folded.
    expect(
      memory.collection("bonds").docs.find((row) => String(row._id) === String(bond(8)._id))
    ).toMatchObject({ matured: true });
  });
});

describe("mergeHolders", () => {
  it("sums a holder's units and keeps distinct holders apart", () => {
    const character = new ObjectId();
    expect(
      mergeHolders([
        { holders: [{ characterId: character, units: 1 }] },
        {
          holders: [
            { characterId: character, units: 2 },
            { fundId: fundA, units: 3 },
          ],
        },
        { holders: [{ fundId: fundA, units: 0 }] },
      ])
    ).toEqual([
      { characterId: character, units: 3 },
      { fundId: fundA, units: 3 },
    ]);
  });
});
