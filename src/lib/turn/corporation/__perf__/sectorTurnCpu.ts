/**
 * CPU profile of one corporation-turn sector pass at production scale.
 *
 *   npx tsx src/lib/turn/corporation/__perf__/sectorTurnCpu.ts [corps] [sectorsPerCorp]
 *
 * Builds the seeded production-shape world (default 2,000 corporations and
 * 14,000 sectors), runs `processSectors` and `buildFreightBillingBySector` once
 * under the inspector profiler, writes the raw profile to /tmp/opencode and
 * prints self time per function plus inclusive time for the phase's named
 * entry points. The profile is written through the inspector API rather than
 * `--cpu-prof` so it survives a process that leaves timers behind.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { Session } from "node:inspector/promises";
import { processSectors } from "../sectorCalculations";
import { buildFreightBillingBySector } from "../freightBillingTurn";
import { computeIdleUpkeep } from "../sectorTurn/idleUpkeep";
import { computeMarketTiers } from "../sectorTurn/marketTiers";
import { computeSupplyAgreementBuyerDemand } from "@/lib/corporations/groups/rules/inputDemand";
import { getEffectiveStrategyRatesForOperatingModel } from "@/lib/constants/sectorStrategies";
import { buildProductionTurnWorld } from "../__fixtures__/productionTurnWorld";

interface ProfileNode {
  id: number;
  callFrame: {
    functionName: string;
    url: string;
    lineNumber: number;
  };
  children?: number[];
}

interface CpuProfile {
  nodes: ProfileNode[];
  startTime: number;
  endTime: number;
  samples: number[];
  timeDeltas: number[];
}

const WATCHED = [
  "processSectors",
  "prepareInternalSupplySectorResults",
  "processSector",
  "buildInternalSupplyContext",
  "buildFreightBillingBySector",
  "computeIdleUpkeep",
  "computeMarketTiers",
  "settleConsumedInternalDiscounts",
  "settleGroupDiscounts",
  "resolveSectorFreightBillingLegs",
  "computeSupplyAgreementBuyerDemand",
  "eraScaledBasePrices",
  "structuredClone",
];

function summarise(profile: CpuProfile) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map<number, number>();
  for (const node of profile.nodes)
    for (const child of node.children ?? []) parent.set(child, node.id);
  const self = new Map<number, number>();
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i]!;
    const delta = profile.timeDeltas[i] ?? 0;
    self.set(id, (self.get(id) ?? 0) + delta);
  }
  const keyOf = (node: ProfileNode) =>
    `${node.callFrame.functionName || "(anonymous)"} ${node.callFrame.url
      .replace(/^file:\/\//, "")
      .replace(/^.*\/worktrees\/[^/]+\//, "")}:${node.callFrame.lineNumber + 1}`;
  const selfMs = new Map<string, number>();
  for (const [id, us] of self) {
    const node = nodes.get(id);
    if (!node) continue;
    const key = keyOf(node);
    selfMs.set(key, (selfMs.get(key) ?? 0) + us / 1000);
  }
  const inclusiveMs = new Map<string, number>();
  for (const [id, us] of self) {
    const seen = new Set<number>();
    let cursor: number | undefined = id;
    while (cursor !== undefined) {
      if (seen.has(cursor)) break;
      seen.add(cursor);
      const node = nodes.get(cursor);
      if (node) {
        const name = node.callFrame.functionName;
        if (name) inclusiveMs.set(name, (inclusiveMs.get(name) ?? 0) + us / 1000);
      }
      cursor = parent.get(cursor);
    }
  }
  const gcMs = [...self].reduce((total, [id, us]) => {
    const name = nodes.get(id)?.callFrame.functionName ?? "";
    return name === "(garbage collector)" || name === "(GC)" ? total + us / 1000 : total;
  }, 0);
  return { selfMs, inclusiveMs, gcMs };
}

function print(label: string, summary: ReturnType<typeof summarise>) {
  console.log(`\n=== ${label} ===`);
  console.log(`GC: ${summary.gcMs.toFixed(0)} ms`);
  for (const name of WATCHED) {
    const inclusive = summary.inclusiveMs.get(name);
    if (inclusive !== undefined) console.log(`inclusive ${name}: ${inclusive.toFixed(0)} ms`);
  }
  console.log("\ntop self time:");
  for (const [key, ms] of [...summary.selfMs].sort((a, b) => b[1] - a[1]).slice(0, 25))
    console.log(`  ${ms.toFixed(0).padStart(6)} ms  ${key}`);
}

async function main() {
  if (process.argv.includes("micro")) {
    micro();
    return;
  }
  const corpCount = Number(process.argv[2] ?? 2000);
  const sectorsPerCorp = Number(process.argv[3] ?? 7);
  const runs = Math.max(1, Number(process.argv[4] ?? 3));
  const world = buildProductionTurnWorld({
    corporations: corpCount,
    sectorsPerCorp,
    seed: 7,
    liveDocumentShape: true,
  });
  console.log(`world: ${world.corporations.length} corporations, ${world.sectors.length} sectors`);

  // Warm-up runs first: the first pass JIT-compiles the whole loop, and this
  // host is shared, so a single wall figure is noise. The profile is taken on
  // the last run.
  const timings: number[] = [];
  const cpuTimings: number[] = [];
  let result = processSectors(
    world.lookups,
    world.turn,
    world.now,
    true,
    1991,
    world.labour,
    world.market
  );
  for (let run = 1; run < runs; run++) {
    const cpuBefore = process.cpuUsage();
    const started = performance.now();
    result = processSectors(
      world.lookups,
      world.turn,
      world.now,
      true,
      1991,
      world.labour,
      world.market
    );
    timings.push(performance.now() - started);
    const cpu = process.cpuUsage(cpuBefore);
    cpuTimings.push((cpu.user + cpu.system) / 1000);
  }

  const session = new Session();
  session.connect();
  await session.post("Profiler.enable");
  await session.post("Profiler.setSamplingInterval", { interval: 200 });
  await session.post("Profiler.start");
  const started = performance.now();
  result = processSectors(
    world.lookups,
    world.turn,
    world.now,
    true,
    1991,
    world.labour,
    world.market
  );
  const sectorMs = performance.now() - started;
  const freightStarted = performance.now();
  const freight = buildFreightBillingBySector({
    lookups: world.lookups,
    currentTurn: world.turn,
    plantsEnabled: true,
    currentYear: 1991,
    commandEconomyEnabled: false,
  });
  const freightMs = performance.now() - freightStarted;
  const { profile } = await session.post("Profiler.stop");
  session.disconnect();

  mkdirSync("/tmp/opencode", { recursive: true });
  const out = `/tmp/opencode/turn-${corpCount}x${sectorsPerCorp}.cpuprofile`;
  writeFileSync(out, JSON.stringify(profile));
  console.log(`profile: ${out}`);

  const summary = summarise(profile as CpuProfile);
  print(
    `one turn: ${world.sectors.length} sectors, ${result.sectorsProcessed} processed, ${result.sectorOps.length} sector ops, ${freight.chargeBySectorId.size} freight charges`,
    summary
  );
  console.log(
    `\nwall: processSectors ${sectorMs.toFixed(0)} ms (earlier runs: ${timings
      .map((ms) => ms.toFixed(0))
      .join(", ")}), freight ${freightMs.toFixed(0)} ms`
  );
  console.log(
    `cpu: earlier runs: ${cpuTimings.map((ms) => ms.toFixed(0)).join(", ")} ms user+system`
  );
  console.log(
    `revenue ${result.totalRevenueGenerated.toFixed(2)}, income ${result.totalIncomeGenerated.toFixed(2)}`
  );
}

/**
 * Per-function micro-benchmarks. These are the calls the production profile
 * put at the top of the self-time list; running each in a tight loop isolates a
 * change from the rest of the turn. `cpu` is user+system time, so host
 * contention moves it far less than wall clock.
 */
function micro() {
  const world = buildProductionTurnWorld({
    corporations: 200,
    sectorsPerCorp: 7,
    seed: 7,
    liveDocumentShape: true,
  });
  const sector = world.sectors[0]!;
  const rates = getEffectiveStrategyRatesForOperatingModel(
    sector.sectorType,
    sector.strategyId ?? "standard",
    sector.transitionFromStrategyId,
    sector.transitionStartTurn,
    world.turn
  );
  const time = (label: string, iterations: number, run: () => void) => {
    run();
    const before = process.cpuUsage();
    const started = performance.now();
    for (let i = 0; i < iterations; i++) run();
    const cpu = process.cpuUsage(before);
    const wall = performance.now() - started;
    console.log(
      `${label}: ${((cpu.user + cpu.system) / 1000 / iterations).toFixed(3)} ms cpu/op, ` +
        `${(wall / iterations).toFixed(3)} ms wall/op over ${iterations} ops`
    );
  };
  const idleInput = {
    sector,
    plantsEnabled: true,
    mothballed: false,
    effectiveMargin: 22,
    plantsMixPrice: 12.5,
    plantsCapacity: sector.operatingCapacityUnits ?? 1000,
    producedUnits: sector.producedUnits ?? 900,
    plantsRampLambda: 1,
    disasterOutputFactor: 1,
    nationalizationTransition: 1,
    plantsExtractionHardMin: 1,
    throughputFactor: 0.95,
    labourOutputFactor: 1,
    demandThrottleFactor: 0.9,
  };
  time("computeIdleUpkeep", 200_000, () => computeIdleUpkeep(idleInput));
  const tiersInput = {
    sector,
    market: world.market,
    priceRatioByCommodity: world.lookups.priceRatioByCommodity,
    stateInputAvailabilityByState: world.lookups.stateInputAvailabilityByState,
    strategySupply: rates.supply,
    strategyDemand: rates.demand,
    wideCommodityBalances: world.lookups.globalCommodityBalances,
    stateBalances: world.lookups.rawStateBalances.get(sector.stateId),
    stateId: sector.stateId,
    currentTurn: world.turn,
    preFlipNameplateRevenue: sector.revenue,
    perTurnGrowthRate: 0.01,
    eraUnitScale: world.lookups.eraUnitScale,
  };
  time("computeMarketTiers", 20_000, () => computeMarketTiers(tiersInput));
  const demandSectors = world.sectors.slice(0, 700).map((s) => ({
    corporationId: s.corporationId.toString(),
    sectorType: s.sectorType,
    industryModel: s.industryModel,
    mediaDiscriminator: s.mediaDiscriminator,
    revenueAnchor: s.revenue,
    strategyId: s.strategyId,
    transitionFromStrategyId: s.transitionFromStrategyId,
    transitionStartTurn: s.transitionStartTurn,
    productionPolicyLevel: s.productionPolicyLevel,
    producedUnits: s.producedUnits,
    capacityUnits: s.operatingCapacityUnits ?? s.capitalStock,
    mothballed: s.mothballed,
    isNatcorp: false,
    stateId: s.stateId,
  }));
  time("buyerDemandPerSector", 3, () => {
    for (const demandSector of demandSectors)
      computeSupplyAgreementBuyerDemand({
        preset: world.lookups.preset,
        sectors: [demandSector],
        currentTurn: world.turn,
        unitScale: world.lookups.eraUnitScale,
        plantsEnabled: true,
      });
  });
  time("buildFreightBilling", 5, () =>
    buildFreightBillingBySector({
      lookups: world.lookups,
      currentTurn: world.turn,
      plantsEnabled: true,
      currentYear: 1991,
      commandEconomyEnabled: false,
    })
  );
}

void main();
