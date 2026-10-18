import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import type { Corporation, CorporateSector, UnownedSector } from "@/lib/db/types";
import type { CorporationOperatorPolicy } from "@/lib/db/types/corporation";
import { CAPACITY_ANCHOR_YEAR } from "@/lib/constants/capacityEconomy";
import { AUTOPILOT_MODIFIERS } from "@/lib/corporations/autopilot";
import { ceoArchetypeModifiers } from "../ceoArchetype";
import { makeNppCorpDecision } from "./makeCorpDecision";

const PLANTS = {
  enabled: true,
  eraUnitScale: 1,
  year: CAPACITY_ANCHOR_YEAR,
  preset: "2019-default",
  primeRateOf: () => 0,
  costOfLivingOf: () => null,
} as const;

interface Options {
  autopilot?: boolean;
  policy?: CorporationOperatorPolicy;
  losingSector?: boolean;
}

function run({ autopilot = false, policy, losingSector = false }: Options = {}) {
  const corp = {
    _id: new ObjectId(),
    type: "energy",
    countryId: "US",
    headquartersState: "ND",
    liquidCurrencyCode: "USD",
    liquidCapital: 36_800_000,
    ceoType: autopilot ? "character" : "npp",
    ceoId: new ObjectId(),
    userId: autopilot ? new ObjectId() : undefined,
    autopilot: autopilot ? { enabledTurn: 1 } : undefined,
    operatorPolicy: policy,
    logisticsStrength: 1000,
  } as unknown as Corporation;
  const specs: Array<[string, string, string, number]> = [
    ["energy", "US", "ND", 52_528],
    ["energy", "US", "WY", 53_976],
    ["chemical_industries", "CA", "ON", 3_090],
  ];
  const profit = 5_000_000;
  const sectors = specs.map(
    ([sectorType, countryId, stateId, units]) =>
      ({
        _id: new ObjectId(),
        corporationId: corp._id,
        sectorType,
        countryId,
        stateId,
        revenue: profit * 3,
        profitMargin: 33,
        plantsPnl: { revenue: profit * 3, costs: profit * 2, profit },
        capitalStock: units,
        operatingCapacityUnits: units,
        producedUnits: units,
        soldUnits: units,
        buildQueue: [],
      }) as unknown as CorporateSector
  );
  if (losingSector) {
    sectors[2] = {
      ...sectors[2],
      revenue: 100,
      profitMargin: -900,
      plantsPnl: { revenue: 100, costs: 1000, profit: -900 },
    } as CorporateSector;
  }
  const pools = specs.map(
    ([sectorType, countryId, stateId]) =>
      ({
        _id: new ObjectId(),
        countryId,
        stateId,
        sectorType,
        revenue: 1,
        headroomUnits: 1_000_000,
      }) as UnownedSector
  );
  const byCountry = new Map<string, UnownedSector[]>();
  for (const pool of pools)
    byCountry.set(pool.countryId, [...(byCountry.get(pool.countryId) ?? []), pool]);
  const decision = makeNppCorpDecision(
    {
      corp,
      sectors,
      turn: 242,
      now: new Date("2026-01-01"),
      modifiers: autopilot ? AUTOPILOT_MODIFIERS : ceoArchetypeModifiers("cautious"),
      strategyLoopEnabled: false,
    },
    byCountry,
    new Set(),
    () => 2,
    PLANTS
  );
  return { decision, sectors };
}

/** Growth orders only; a sliver is wear replacement, which the policy never blocks. */
function growthOrders(r: ReturnType<typeof run>) {
  return (r.decision.reinvestments ?? [])
    .map((b) => ({ b, sector: r.sectors.find((s) => s._id.equals(b.sectorId))! }))
    .filter(({ b, sector }) => b.units >= (sector.capitalStock ?? 0) * 0.01)
    .map(({ sector }) => sector);
}

const grownTypes = (r: ReturnType<typeof run>) => new Set(growthOrders(r).map((s) => s.sectorType));

describe("operator policy in the corporation decision", () => {
  it("changes nothing without a policy", () => {
    const base = run();
    expect(base.decision.reinvestments?.length).toBeGreaterThan(0);
    expect(base.decision.updates.marketingBudget).toBeGreaterThan(0);
  });

  it("stops growth when the owner forbids it", () => {
    const r = run({ policy: { setTurn: 1, actions: { grow: "never" } } });
    expect(growthOrders(r)).toHaveLength(0);
    // Wear replacement continues.
    expect(r.decision.reinvestments?.length).toBeGreaterThan(0);
  });

  it("grows only in the allowed sector types", () => {
    expect(grownTypes(run())).toContain("chemical_industries");
    const r = run({ policy: { setTurn: 1, sectorTypes: ["energy"] } });
    expect([...grownTypes(r)]).toEqual(["energy"]);
  });

  it("grows only in the allowed countries", () => {
    const r = run({ policy: { setTurn: 1, countryIds: ["CA"] } });
    const grown = growthOrders(r).map((s) => s.countryId);
    expect(grown.length).toBeGreaterThan(0);
    expect(new Set(grown)).toEqual(new Set(["CA"]));
  });

  it("founds no new sectors when the owner forbids it", () => {
    expect(
      run({ policy: { setTurn: 1, actions: { found: "never" } } }).decision.newSectors
    ).toBeUndefined();
  });

  it("leaves budgets and dividends alone when the owner keeps them", () => {
    const r = run({ policy: { setTurn: 1, actions: { budgets: "never", dividends: "never" } } });
    expect(r.decision.updates.marketingBudget).toBeUndefined();
    expect(r.decision.updates.logisticsBudget).toBeUndefined();
    expect(r.decision.updates.rdBudget).toBeUndefined();
    expect(r.decision.updates.dividendRate).toBeUndefined();
  });

  it("sheds a losing sector only when divest is allowed", () => {
    const allowed = run({ losingSector: true });
    expect(allowed.decision.divestedSectorIds).toHaveLength(1);
    const never = run({ losingSector: true, policy: { setTurn: 1, actions: { divest: "never" } } });
    expect(never.decision.divestedSectorIds).toBeUndefined();
  });

  it("keeps autopilot from divesting, and lets the owner switch that on", () => {
    const def = run({ autopilot: true, losingSector: true });
    expect(def.decision.divestedSectorIds).toBeUndefined();
    expect(def.decision.autopilotSignals?.losingSectors).toBe(1);
    const allowed = run({
      autopilot: true,
      losingSector: true,
      policy: { setTurn: 1, actions: { divest: "allow" } },
    });
    expect(allowed.decision.divestedSectorIds).toHaveLength(1);
    expect(allowed.decision.autopilotSignals?.losingSectors).toBe(0);
  });
});
