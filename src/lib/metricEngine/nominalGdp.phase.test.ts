import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "mongodb";
import { createMockDb, type MockDb } from "@/lib/test-utils/mockDb";
import { resetCorpFxRateCacheForTests } from "@/lib/currency/corporationCapital";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";
import { runMetricEngine } from "./phase";

type Op = { updateOne: { filter: { _id: string }; update: { $set: Record<string, number> } } };

interface WorldOptions {
  investment?: number;
  gdp: number;
  priceIndex?: number;
  inflationRate: number;
  budgetGdp?: number;
  budgetGdpSmoothed?: number;
}

/** One US region with a budget; returns the captured state and budget writes. */
function seedWorld(db: MockDb, opts: WorldOptions): { states: Op[]; budgets: Op[] } {
  const setupCollection = <T>(name: string, data: T[]): void => {
    db.collection(name);
    db.collectionMocks[name]!.find = vi.fn().mockReturnValue({
      project: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue(data) }),
      toArray: vi.fn().mockResolvedValue(data),
    });
  };
  db.collection("gameState");
  db.collectionMocks.gameState!.findOne = vi.fn().mockResolvedValue(null);
  setupCollection("states", [
    {
      _id: "s_us",
      name: "s_us",
      countryId: "US",
      population: 100,
      gdp: opts.gdp,
      workingAgePopulation: 70,
      corpGrowthInvestmentAnchor: opts.investment ?? 0,
      corpGrowthInvestmentTurn: 100,
      militaryServicePopulation: 0,
    },
  ]);
  setupCollection("stateMetrics", [
    { _id: "s_us", countryId: "US", economic: { sectorGrowth: { value: 1 } } },
    { _id: "federal", countryId: "US", economic: {} },
  ]);
  db.collectionMocks.macroMetrics = db.collectionMocks.stateMetrics!;
  setupCollection("federalBudget", [
    {
      _id: "federal",
      countryId: "US",
      taxRates: { salesTax: 0 },
      economicFactors: { inflationRate: opts.inflationRate },
      ...(opts.priceIndex === undefined ? {} : { priceIndex: opts.priceIndex }),
      ...(opts.budgetGdp === undefined ? {} : { gdp: opts.budgetGdp }),
      ...(opts.budgetGdpSmoothed === undefined ? {} : { gdpSmoothed: opts.budgetGdpSmoothed }),
    },
  ]);
  setupCollection("corporateSectors", []);
  setupCollection("unownedSectors", []);
  setupCollection("corporations", []);
  setupCollection("exchangeRates", []);
  setupCollection("stateBudgets", [{ _id: "s_us", taxRates: { salesTax: 0 } }]);

  const capture = (name: string): Op[] => {
    const ops: Op[] = [];
    db.collection(name);
    db.collectionMocks[name]!.bulkWrite = vi.fn().mockImplementation((o: Op[]) => {
      ops.push(...o);
      return Promise.resolve({ ok: 1 });
    });
    return ops;
  };
  return { states: capture("states"), budgets: capture("federalBudget") };
}

const setOf = (ops: Op[], id: string) =>
  ops.find((o) => o.updateOne.filter._id === id)!.updateOne.update.$set;

async function run(opts: WorldOptions) {
  resetCorpFxRateCacheForTests();
  const db = createMockDb();
  const writes = seedWorld(db, opts);
  await runMetricEngine(db as unknown as Db, 100);
  return writes;
}

describe("nominal GDP in the metric engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("leaves the real economy untouched when the index is the base and inflation is zero", async () => {
    const base = await run({ gdp: 5_000_000, inflationRate: 0 });
    const state = setOf(base.states, "s_us");
    const budget = setOf(base.budgets, "federal");
    expect(budget.priceIndex).toBe(1);
    expect(state.gdp).toBeGreaterThan(0);
  });

  it("runs capital and growth on real output, whatever the price level", async () => {
    const real = await run({ gdp: 5_000_000, inflationRate: 0 });
    const priced = await run({ gdp: 10_000_000, priceIndex: 2, inflationRate: 0 });
    const a = setOf(real.states, "s_us");
    const b = setOf(priced.states, "s_us");
    expect(b.capitalStock).toBeCloseTo(a.capitalStock!, 6);
    expect(b.gdp).toBeCloseTo(a.gdp! * 2, 4);
    expect(setOf(priced.budgets, "federal").priceIndex).toBeCloseTo(2, 12);
  });

  it("adds a turn of inflation to the nominal level and advances the index", async () => {
    const flat = await run({ gdp: 5_000_000, inflationRate: 0 });
    const inflating = await run({ gdp: 5_000_000, inflationRate: 6 });
    const factor = 1.06 ** (1 / TURNS_PER_YEAR);
    expect(setOf(inflating.states, "s_us").gdp).toBeCloseTo(
      setOf(flat.states, "s_us").gdp! * factor,
      4
    );
    expect(setOf(inflating.budgets, "federal").priceIndex).toBeCloseTo(factor, 12);
  });

  it("refreshes the budget GDP basis every turn, smoothed, in whole currency units", async () => {
    const written = await run({
      gdp: 5_000_000,
      inflationRate: 0,
      budgetGdp: 4_000_000_000_000,
      budgetGdpSmoothed: 4_000_000_000_000,
    });
    const budget = setOf(written.budgets, "federal");
    const live = setOf(written.states, "s_us").gdp! * 1_000_000;
    const inertia = 0.7 ** (1 / TURNS_PER_YEAR);
    expect(budget.gdp).toBeCloseTo(inertia * 4_000_000_000_000 + (1 - inertia) * live, -2);
    expect(budget.gdpSmoothed).toBe(budget.gdp);
  });
});

it("keeps real capital invariant when nominal investment scales with the price level", async () => {
  const base = await run({
    gdp: 5_000_000,
    priceIndex: 1,
    inflationRate: 0,
    investment: 100_000_000,
  });
  const priced = await run({
    gdp: 10_000_000,
    priceIndex: 2,
    inflationRate: 0,
    investment: 200_000_000,
  });
  expect(setOf(priced.states, "s_us").capitalStock).toBeCloseTo(
    setOf(base.states, "s_us").capitalStock,
    6
  );
});
