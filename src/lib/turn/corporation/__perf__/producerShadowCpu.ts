/**
 * CPU profile of the two corporation-turn hot spots goal 15 targets.
 *
 *   npx tsx src/lib/turn/corporation/__perf__/producerShadowCpu.ts [corps] [sectorsPerCorp]
 *
 * Builds the seeded production-shape world (default 2,000 corporations and
 * 14,000 sectors with live document weight) and measures, in isolation:
 *
 * - `computeBlendedMarginModifiers` over every sector, with the same fresh
 *   strategy-rate objects the margin stack hands it;
 * - `isolatedShadowEnv` and `shadowOpeningSector`, the producer shadow's
 *   isolation and per-sector opening.
 *
 * The pre-goal implementations are kept here as reference copies so the two
 * run in one process on one world: this host is shared, and a before/after
 * across separate runs mostly measures the neighbours. The reference copies
 * also assert that both produce the same number for every sector.
 */
import { PerformanceObserver } from "node:perf_hooks";
import { Session } from "node:inspector/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  applyRetailPenaltyFactor,
  COMMODITY_AGGREGATE_INPUT_CAP,
  COMMODITY_AGGREGATE_SURPLUS_CAP,
  COMMODITY_COMBINED_FLOOR,
  COMMODITY_TYPES,
  computeBlendedMarginModifiers,
  computeCommodityMarginModifier,
  computeCommoditySurplusBonus,
  EXTRACTABLE_RESOURCE_STATE_STABILIZER,
  STATE_COMMODITY_SUPPLY_DEMAND,
  type CommodityType,
} from "@/lib/constants/commodities";
import { EXTRACTABLE_RESOURCES } from "@/lib/constants/commoditiesCore";
import {
  getEffectiveStrategyRates,
  getOperatingSectorType,
} from "@/lib/constants/sectorStrategies";
import { getTariffBlendWeights } from "@/lib/tariffs/tariffEffects";
import { NEUTRAL_TECH_EFFECTS } from "@/lib/constants/techTree";
import { emptyProducerSectorOpening } from "@/lib/market/producerMarket/openingState";
import type { CorporateSector } from "@/lib/db/types";
import type { ShadowPlantCarry } from "@/lib/market/producerMarket/shadowCarryRules";
import { isStateScopedCommodity } from "@/lib/market/rules/commodityMarketScope";
import { buildProductionTurnWorld } from "../__fixtures__/productionTurnWorld";
import { isolatedShadowEnv, shadowOpeningSector } from "../producerMarketShadowPhase";
import { scaledCommodityRates, type ProducerPhysicalEnv } from "../producerPhysicalPreparation";

interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
  children?: number[];
}

interface CpuProfile {
  nodes: ProfileNode[];
  samples: number[];
  timeDeltas: number[];
}

const WATCHED = [
  "computeBlendedMarginModifiers",
  "computeCommodityMarginModifier",
  "computeCommoditySurplusBonus",
  "normalizeFlows",
  "commodityFlowKey",
  "isolatedShadowEnv",
  "copyStateAccumulators",
  "shadowOpeningSector",
  "preparationView",
];

function summarise(profile: CpuProfile) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map<number, number>();
  for (const node of profile.nodes)
    for (const child of node.children ?? []) parent.set(child, node.id);
  const self = new Map<number, number>();
  for (let i = 0; i < profile.samples.length; i++)
    self.set(
      profile.samples[i]!,
      (self.get(profile.samples[i]!) ?? 0) + (profile.timeDeltas[i] ?? 0)
    );
  const selfMs = new Map<string, number>();
  const inclusiveMs = new Map<string, number>();
  let gcMs = 0;
  for (const [id, us] of self) {
    const node = nodes.get(id);
    if (!node) continue;
    const name = node.callFrame.functionName || "(anonymous)";
    if (name === "(garbage collector)" || name === "(GC)") {
      gcMs += us / 1000;
      continue;
    }
    selfMs.set(name, (selfMs.get(name) ?? 0) + us / 1000);
    const seen = new Set<number>();
    let cursor: number | undefined = id;
    while (cursor !== undefined) {
      if (seen.has(cursor)) break;
      seen.add(cursor);
      const callFrame = nodes.get(cursor)?.callFrame.functionName;
      if (callFrame) inclusiveMs.set(callFrame, (inclusiveMs.get(callFrame) ?? 0) + us / 1000);
      cursor = parent.get(cursor);
    }
  }
  return { selfMs, inclusiveMs, gcMs };
}

function printSummary(label: string, profile: CpuProfile) {
  const summary = summarise(profile);
  console.log(`\n=== workload profile: ${label} ===`);
  console.log(`GC: ${summary.gcMs.toFixed(0)} ms`);
  for (const name of WATCHED) {
    const inclusive = summary.inclusiveMs.get(name);
    const self = summary.selfMs.get(name) ?? 0;
    if (inclusive === undefined && self === 0) continue;
    console.log(`${name}: inclusive ${(inclusive ?? 0).toFixed(0)} ms, self ${self.toFixed(0)} ms`);
  }
}

/** GC time observed while one measured call runs, from the loop's own entries. */
let observedGcMs = 0;
const gcObserver = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) observedGcMs += entry.duration;
});
gcObserver.observe({ entryTypes: ["gc"] });

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function time(label: string, iterations: number, run: () => void) {
  run();
  await settle();
  observedGcMs = 0;
  const before = process.cpuUsage();
  const started = performance.now();
  for (let i = 0; i < iterations; i++) run();
  const cpu = process.cpuUsage(before);
  const wall = performance.now() - started;
  await settle();
  console.log(
    `${label}: ${((cpu.user + cpu.system) / 1000 / iterations).toFixed(2)} ms cpu/op, ` +
      `${(wall / iterations).toFixed(2)} ms wall/op, ` +
      `${(observedGcMs / iterations).toFixed(2)} ms gc/op over ${iterations} ops`
  );
}

type Balances = Map<CommodityType, { supply: number; demand: number }>;

/** The pre-goal `computeBlendedMarginModifiers`, kept for the in-process comparison. */
function beforeGoalMargin(
  sectorType: Parameters<typeof computeBlendedMarginModifiers>[0],
  globalBalances: Balances,
  nationalBalances: Balances,
  stateBalances: Balances,
  globalWeight = 0.5,
  nationalWeight = 0.25,
  localWeight = 0.25,
  supplyOverride?: Partial<Record<CommodityType, number>>,
  demandOverride?: Partial<Record<CommodityType, number>>
): { inputMod: number; surplusMod: number } {
  const stabilizedState = new Map<CommodityType, { supply: number; demand: number }>();
  for (const c of COMMODITY_TYPES) {
    const s = stateBalances.get(c) ?? { supply: 0, demand: 0 };
    const stab = (EXTRACTABLE_RESOURCES as readonly string[]).includes(c)
      ? EXTRACTABLE_RESOURCE_STATE_STABILIZER
      : STATE_COMMODITY_SUPPLY_DEMAND;
    stabilizedState.set(c, { supply: s.supply + stab, demand: s.demand + stab });
  }
  const globalInput = computeCommodityMarginModifier(sectorType, globalBalances, demandOverride);
  const nationalInput = computeCommodityMarginModifier(
    sectorType,
    nationalBalances,
    demandOverride
  );
  const stateInput = computeCommodityMarginModifier(sectorType, stabilizedState, demandOverride);
  const globalSurplus = computeCommoditySurplusBonus(sectorType, globalBalances, supplyOverride);
  const nationalSurplus = computeCommoditySurplusBonus(
    sectorType,
    nationalBalances,
    supplyOverride
  );
  const stateSurplus = computeCommoditySurplusBonus(sectorType, stabilizedState, supplyOverride);
  const rawInput =
    globalWeight * globalInput + nationalWeight * nationalInput + localWeight * stateInput;
  const penaltiedInput = applyRetailPenaltyFactor(sectorType, Math.round(rawInput * 100) / 100);
  const inputMod = Math.max(-COMMODITY_AGGREGATE_INPUT_CAP, penaltiedInput);
  const rawSurplus =
    globalWeight * globalSurplus + nationalWeight * nationalSurplus + localWeight * stateSurplus;
  const surplusMod = Math.min(COMMODITY_AGGREGATE_SURPLUS_CAP, Math.round(rawSurplus * 100) / 100);
  const combined = inputMod + surplusMod;
  if (combined < -COMMODITY_COMBINED_FLOOR) {
    const scale = COMMODITY_COMBINED_FLOOR / Math.abs(combined);
    return {
      inputMod: Math.round(inputMod * scale * 100) / 100,
      surplusMod: Math.round(surplusMod * scale * 100) / 100,
    };
  }
  return { inputMod, surplusMod };
}

/** The pre-goal `shadowOpeningSector`, kept for the in-process comparison. */
function beforeGoalOpening(
  sector: CorporateSector,
  worldEpoch: string,
  turn: number,
  carried?: ShadowPlantCarry
): CorporateSector {
  const opening = emptyProducerSectorOpening(worldEpoch, Math.max(0, turn - 1));
  if (carried)
    return {
      ...sector,
      capacityBookAnchor: sector.capacityBookAnchor ?? 0,
      buildQueue: Array.isArray(sector.buildQueue) ? sector.buildQueue : [],
      producerCapacity: opening.producerCapacity,
      producerInventory: {
        ...opening.producerInventory,
        inputStock: carried.inputStock,
        outputStock: carried.outputStock,
      },
      producerSettlement: { ...carried.receipt, turn: turn - 1 },
    } as CorporateSector;
  if (sector.producerCapacity && sector.producerInventory) return sector;
  const outputStock = Object.entries(sector.inventoryUnits ?? {})
    .filter(([, units]) => typeof units === "number" && Number.isFinite(units) && units > 0)
    .map(([commodity, units]) => ({
      commodity,
      units: units as number,
      book: isStateScopedCommodity(commodity as CommodityType)
        ? `state:${sector.stateId}`
        : "world",
    }));
  return {
    ...sector,
    capacityBookAnchor: sector.capacityBookAnchor ?? 0,
    buildQueue: Array.isArray(sector.buildQueue) ? sector.buildQueue : [],
    producerCapacity: opening.producerCapacity,
    producerInventory: { ...opening.producerInventory, outputStock },
  };
}

async function main() {
  const corpCount = Number(process.argv[2] ?? 2000);
  const sectorsPerCorp = Number(process.argv[3] ?? 7);
  const world = buildProductionTurnWorld({
    corporations: corpCount,
    sectorsPerCorp,
    seed: 7,
    liveDocumentShape: true,
  });
  const lookups = world.lookups;
  console.log(`world: ${world.corporations.length} corporations, ${world.sectors.length} sectors`);

  // What the margin stack passes per sector: the same global map, the sector's
  // national and state maps, the tariff weights, and fresh scaled rate objects.
  const marginInputs = world.sectors.map((sector) => {
    const operatingSectorType = getOperatingSectorType(
      sector.sectorType,
      sector.industryModel,
      sector.mediaDiscriminator
    );
    const rates = getEffectiveStrategyRates(
      sector.sectorType,
      sector.strategyId ?? "standard",
      sector.transitionFromStrategyId,
      sector.transitionStartTurn,
      world.turn
    );
    const { globalWeight, nationalWeight, localWeight } = getTariffBlendWeights(
      lookups.allTariffs,
      "US",
      operatingSectorType,
      lookups.sectorPresenceKeys,
      lookups.ftaCoverage
    );
    return {
      operatingSectorType,
      national: lookups.nationalCommodityBalancesByCountry.get("US")!,
      state: lookups.rawStateBalances.get(sector.stateId)!,
      globalWeight,
      nationalWeight,
      localWeight,
      supply: scaledCommodityRates(rates.supply, NEUTRAL_TECH_EFFECTS.outputRateMult),
      demand: scaledCommodityRates(rates.demand, NEUTRAL_TECH_EFFECTS.inputRateMult),
    };
  });
  await time("margin before goal", 3, () => {
    for (const input of marginInputs)
      beforeGoalMargin(
        input.operatingSectorType,
        lookups.globalCommodityBalances,
        input.national,
        input.state,
        input.globalWeight,
        input.nationalWeight,
        input.localWeight,
        input.supply,
        input.demand
      );
  });
  await time("margin after goal", 3, () => {
    for (const input of marginInputs)
      computeBlendedMarginModifiers(
        input.operatingSectorType,
        lookups.globalCommodityBalances,
        input.national,
        input.state,
        input.globalWeight,
        input.nationalWeight,
        input.localWeight,
        input.supply,
        input.demand
      );
  });
  let marginMismatches = 0;
  for (const input of marginInputs) {
    const before = beforeGoalMargin(
      input.operatingSectorType,
      lookups.globalCommodityBalances,
      input.national,
      input.state,
      input.globalWeight,
      input.nationalWeight,
      input.localWeight,
      input.supply,
      input.demand
    );
    const after = computeBlendedMarginModifiers(
      input.operatingSectorType,
      lookups.globalCommodityBalances,
      input.national,
      input.state,
      input.globalWeight,
      input.nationalWeight,
      input.localWeight,
      input.supply,
      input.demand
    );
    if (before.inputMod !== after.inputMod || before.surplusMod !== after.surplusMod)
      marginMismatches++;
  }
  console.log(`margin mismatches: ${marginMismatches}`);

  // The shadow's environment: the live turn's collectors, as the corporation
  // phase hands them over.
  const stateIds = [...new Set(world.sectors.map((s) => s.stateId))];
  const env = {
    lookups,
    currentTurn: world.turn,
    currentYear: 1991,
    techTreesEnabled: true,
    labour: world.labour,
    wageIndexByState: new Map(
      stateIds.map((stateId, i) => [stateId, { weighted: 1 + i / 10, workers: 1000 + i }])
    ),
    automationIndexByState: new Map(
      stateIds.map((stateId, i) => [stateId, { weighted: 1 + i / 20, workers: 900 + i }])
    ),
    pendingStrikeEvents: [{ sectorId: "x" }],
    labourDemandByState: new Map(stateIds.map((stateId, i) => [stateId, 100 + i])),
    labourDemandWageIndexByState: new Map(
      stateIds.map((stateId, i) => [stateId, { weighted: 1 + i / 30, workers: 800 + i }])
    ),
  } as unknown as ProducerPhysicalEnv;
  await time("isolation before goal (structuredClone)", 200, () => {
    const {
      labourDemandByState,
      labourDemandWageIndexByState,
      wageIndexByState,
      automationIndexByState,
    } = env;
    void {
      ...env,
      labourDemandByState: structuredClone(labourDemandByState),
      labourDemandWageIndexByState: structuredClone(labourDemandWageIndexByState),
      wageIndexByState: structuredClone(wageIndexByState),
      automationIndexByState: structuredClone(automationIndexByState),
      pendingStrikeEvents: [],
    };
  });
  await time("isolation after goal (shallow copies)", 200, () => isolatedShadowEnv(env));

  const carry = new Map<string, ShadowPlantCarry>(
    world.sectors.map((sector) => [
      sector._id.toString(),
      {
        inputStock: [],
        outputStock: [{ commodity: "steel", book: "world", units: 3 }],
        receipt: {
          activeUnits: 10,
          producedUnits: 9,
          offeredUnits: 9,
          soldUnits: 8,
          revenue: 100,
          inputsConsumed: 40,
        },
      },
    ])
  );
  await time("opening before goal (spread, new run)", 3, () => {
    for (const sector of world.sectors) beforeGoalOpening(sector, "world", world.turn);
  });
  await time("opening after goal (view, new run)", 3, () => {
    for (const sector of world.sectors) shadowOpeningSector(sector, "world", world.turn);
  });
  await time("opening before goal (spread, carried)", 3, () => {
    for (const sector of world.sectors)
      beforeGoalOpening(sector, "world", world.turn, carry.get(sector._id.toString()));
  });
  await time("opening after goal (view, carried)", 3, () => {
    for (const sector of world.sectors)
      shadowOpeningSector(sector, "world", world.turn, carry.get(sector._id.toString()));
  });
  let openingMismatches = 0;
  for (const sector of world.sectors) {
    const before = beforeGoalOpening(sector, "world", world.turn, carry.get(sector._id.toString()));
    const after = shadowOpeningSector(
      sector,
      "world",
      world.turn,
      carry.get(sector._id.toString())
    );
    for (const key of Object.keys(after) as (keyof CorporateSector)[]) {
      if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) openingMismatches++;
    }
  }
  console.log(`opening mismatches: ${openingMismatches}`);

  // Profile each workload on its own so the GC figure belongs to one pass
  // rather than to the whole script.
  const profiled: { label: string; run: () => void }[] = [
    {
      label: "margin before goal",
      run: () => {
        for (const input of marginInputs)
          beforeGoalMargin(
            input.operatingSectorType,
            lookups.globalCommodityBalances,
            input.national,
            input.state,
            input.globalWeight,
            input.nationalWeight,
            input.localWeight,
            input.supply,
            input.demand
          );
      },
    },
    {
      label: "margin after goal",
      run: () => {
        for (const input of marginInputs)
          computeBlendedMarginModifiers(
            input.operatingSectorType,
            lookups.globalCommodityBalances,
            input.national,
            input.state,
            input.globalWeight,
            input.nationalWeight,
            input.localWeight,
            input.supply,
            input.demand
          );
      },
    },
    {
      label: "opening before goal (carried)",
      run: () => {
        for (const sector of world.sectors)
          beforeGoalOpening(sector, "world", world.turn, carry.get(sector._id.toString()));
      },
    },
    {
      label: "opening after goal (carried)",
      run: () => {
        for (const sector of world.sectors)
          shadowOpeningSector(sector, "world", world.turn, carry.get(sector._id.toString()));
      },
    },
    { label: "isolation after goal", run: () => isolatedShadowEnv(env) },
  ];
  const session = new Session();
  session.connect();
  await session.post("Profiler.enable");
  await session.post("Profiler.setSamplingInterval", { interval: 200 });
  mkdirSync("/tmp/opencode", { recursive: true });
  for (const workload of profiled) {
    await session.post("Profiler.start");
    workload.run();
    const { profile } = await session.post("Profiler.stop");
    const slug = workload.label.replace(/[^a-z0-9]+/gi, "-");
    writeFileSync(
      `/tmp/opencode/producer-shadow-${slug}-${corpCount}x${sectorsPerCorp}.cpuprofile`,
      JSON.stringify(profile)
    );
    printSummary(workload.label, profile as CpuProfile);
  }
  session.disconnect();
  console.log(`profiles written to /tmp/opencode/producer-shadow-*`);
  console.log(`commodities: ${COMMODITY_TYPES.length}`);
}

void main();
