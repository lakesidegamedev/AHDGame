/**
 * CPU profile of the two corporation-turn substeps goal 16 targets.
 *
 *   npx tsx src/lib/turn/corporation/__perf__/marketContextCpu.ts [corps] [sectorsPerCorp]
 *
 * The production turn spends its market-context substep inside
 * `runClearingPrePass` and its lookup substep inside `buildCorporationLookups`,
 * both of them CPU rather than round-trip bound. Point `AHD_PERF_MONGO_URI` at
 * a local COPY of a world and the script profiles both over that world's real
 * documents: the lookup build, the freight-billing apportionment the
 * market-context substep runs before the pre-pass, and the pre-pass itself,
 * with the market context built from the same gameConfig the turn reads.
 *
 * Without a URI it falls back to the seeded production-shape fixture, which has
 * no database, and profiles the two DB-free workloads only.
 *
 * Each workload is profiled on its own so the GC figure belongs to one pass
 * rather than to the whole script. Never point it at production.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { Session } from "node:inspector/promises";
import { PerformanceObserver } from "node:perf_hooks";
import { MongoClient, type Db } from "mongodb";
import { buildMarketContext } from "@/lib/market/marketContext";
import type { GameConfig } from "@/lib/db/types/gameConfig";
import { getMarketSystemMode } from "@/lib/market/featureFlag";
import { normalizeCommodityFixStage } from "@/lib/market/commodityFixStages";
import { normalizeMarketRecoveryStage } from "@/lib/market/marketRecoveryStages";
import { runClearingPrePass, type ClearingPrePassInput } from "../clearingPrePass";
import { buildFreightBillingBySector } from "../freightBillingTurn";
import { buildCorporationLookups } from "../buildLookups";
import { loadSettleableSupplyAgreements } from "../loadSettleableSupplyAgreements";
import type { CorporationLookups } from "../types";
import {
  buildProductionTurnWorld,
  type ProductionTurnWorld,
} from "../__fixtures__/productionTurnWorld";

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
  "buildCorporationLookups",
  "runClearingPrePass",
  "buildFreightBillingBySector",
  "computeClearingFactors",
  "buildInternalSupplyContext",
  "finishInternalSupplyContext",
  "reserveInternalSupply",
  "allocateInternalSupply",
  "internalSupplyAvailability",
  "computeSupplyAgreementBuyerDemand",
  "getEffectiveStrategyRatesForOperatingModel",
  "eraScaledBasePrices",
  "advertisingDeliveredValueByCorp",
  "retoolProductionMeasurements",
  "buildNationalCommodityBalances",
];

function summarise(profile: CpuProfile) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map<number, number>();
  for (const node of profile.nodes)
    for (const child of node.children ?? []) parent.set(child, node.id);
  const self = new Map<number, number>();
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i]!;
    self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0));
  }
  const keyOf = (node: ProfileNode) =>
    `${node.callFrame.functionName || "(anonymous)"} ${node.callFrame.url
      .replace(/^file:\/\//, "")
      .replace(/^.*\/worktrees\/[^/]+\//, "")}:${node.callFrame.lineNumber + 1}`;
  const selfMs = new Map<string, number>();
  const inclusiveMs = new Map<string, number>();
  let gcMs = 0;
  for (const [id, us] of self) {
    const node = nodes.get(id);
    if (!node) continue;
    const name = node.callFrame.functionName;
    if (name === "(garbage collector)" || name === "(GC)") {
      gcMs += us / 1000;
      continue;
    }
    const key = keyOf(node);
    selfMs.set(key, (selfMs.get(key) ?? 0) + us / 1000);
    const seen = new Set<number>();
    let cursor: number | undefined = id;
    while (cursor !== undefined) {
      if (seen.has(cursor)) break;
      seen.add(cursor);
      const frame = nodes.get(cursor)?.callFrame.functionName;
      if (frame) inclusiveMs.set(frame, (inclusiveMs.get(frame) ?? 0) + us / 1000);
      cursor = parent.get(cursor);
    }
  }
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

let observedGcMs = 0;
const gcObserver = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) observedGcMs += entry.duration;
});
gcObserver.observe({ entryTypes: ["gc"] });

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function time(label: string, iterations: number, run: () => void | Promise<void>) {
  await run();
  await settle();
  observedGcMs = 0;
  const before = process.cpuUsage();
  const started = performance.now();
  for (let i = 0; i < iterations; i++) await run();
  const cpu = process.cpuUsage(before);
  const wall = performance.now() - started;
  await settle();
  console.log(
    `${label}: ${((cpu.user + cpu.system) / 1000 / iterations).toFixed(1)} ms cpu/op, ` +
      `${(wall / iterations).toFixed(1)} ms wall/op, ` +
      `${(observedGcMs / iterations).toFixed(1)} ms gc/op over ${iterations} ops`
  );
}

/** One world the pre-pass can run against, with its flags resolved once. */
interface PrePassWorld {
  lookups: CorporationLookups;
  market: ReturnType<typeof buildMarketContext>;
  turn: number;
  currentYear: number;
  commandEconomyEnabled: boolean;
  freightSettlementActive: boolean;
  supplyAgreementsEnabled: boolean;
  settleableAgreements: ReturnType<typeof loadSettleableSupplyAgreements> extends Promise<infer T>
    ? T
    : never;
  stateLocalClearingBlocked: boolean;
  brandLoyaltyEnabled: boolean;
  brandLoyaltySliceEnabled: boolean;
  qualityPremiumPricingEnabled: boolean;
  treasuryCashLedgerEnabled: boolean;
}

/**
 * A fresh copy of the mutable state the pre-pass fills in. The prepass writes
 * reservations into these maps, so every run starts from the same place the
 * turn does.
 */
function prePassInput(world: PrePassWorld): ClearingPrePassInput {
  const market = { ...world.market };
  return {
    lookups: world.lookups,
    market,
    turn: world.turn,
    currentYear: world.currentYear,
    commandEconomyEnabled: world.commandEconomyEnabled,
    freightSettlementActive: world.freightSettlementActive,
    supplyAgreementsEnabled: world.supplyAgreementsEnabled,
    settleableAgreements: world.settleableAgreements.agreements,
    contractedByCorpCommodity: new Map<string, Map<string, number>>(),
    contractSettlementByCorp: new Map<string, Map<string, number>>(),
    producedByCorpCommodity: new Map<string, Map<string, number>>(),
    achievableByCorpCommodity: new Map<string, Map<string, number | null>>(),
    stateLocalClearingBlockedByLegacyAgreement: world.stateLocalClearingBlocked,
    brandLoyaltyEnabled: world.brandLoyaltyEnabled,
    brandLoyaltySliceEnabled: world.brandLoyaltySliceEnabled,
    qualityPremiumPricingEnabled: world.qualityPremiumPricingEnabled,
    treasuryCashLedgerEnabled: world.treasuryCashLedgerEnabled,
    fundedProducerTurn: false,
  };
}

/** The fixture world: no database, so the market context is the fixture's own. */
function fixtureWorld(world: ProductionTurnWorld): PrePassWorld {
  return {
    lookups: {
      ...world.lookups,
      eraUnitScale: 1,
      eraYear: 1991,
    } as unknown as CorporationLookups,
    market: world.market,
    turn: world.turn,
    currentYear: 1991,
    commandEconomyEnabled: false,
    freightSettlementActive: false,
    supplyAgreementsEnabled: false,
    settleableAgreements: { agreements: [], legacyStateLocalAgreementLive: false },
    stateLocalClearingBlocked: false,
    brandLoyaltyEnabled: false,
    brandLoyaltySliceEnabled: false,
    qualityPremiumPricingEnabled: false,
    treasuryCashLedgerEnabled: false,
  };
}

/** Resolve the pre-pass flags from the same gameConfig document the turn reads. */
async function databaseWorld(
  db: Db,
  lookups: CorporationLookups,
  config: GameConfig | null
): Promise<PrePassWorld> {
  const gameState = (await db.collection("gameState").findOne({ _id: "current" })) as {
    currentTurn?: number;
    currentYear?: number;
  } | null;
  const turn = gameState?.currentTurn ?? 0;
  const marketSystemMode = await getMarketSystemMode(config);
  const market = buildMarketContext(marketSystemMode, {
    cap: config?.marketGovernorCap,
    rampTurns: config?.marketGovernorRampTurns,
    currentTurn: turn,
    glideStartTurn: config?.marketGovernorGlideStartTurn,
    glideTurns: config?.marketGovernorGlideTurns,
    glideMode: config?.marketGovernorGlideMode,
    glideFloor: config?.marketGovernorGlideFloor,
  });
  market.explicitPlantCostsEnabled = config?.explicitPlantCostsEnabled === true;
  market.commodityFixStage = normalizeCommodityFixStage(config?.commodityFixStage);
  market.marketRecoveryStage = normalizeMarketRecoveryStage(config?.marketRecoveryStage);
  const freightSettlementActive =
    (config as { freightSettlementMode?: string } | null)?.freightSettlementMode === "active";
  if (config?.canonicalFreightBillingEnabled === true) {
    const billing = buildFreightBillingBySector({
      lookups,
      currentTurn: turn,
      plantsEnabled: market.plantsEnabled,
      currentYear: gameState?.currentYear,
      commandEconomyEnabled: config?.commandEconomyEnabled === true,
    });
    market.freightBillingChargeBySectorId = billing.chargeBySectorId;
    market.freightBillingCreditBySectorId = billing.creditBySectorId;
  }
  const supplyAgreementsEnabled = config?.supplyAgreementsEnabled === true;
  const loaded = supplyAgreementsEnabled
    ? await loadSettleableSupplyAgreements({ db, turn, now: new Date() })
    : { agreements: [], legacyStateLocalAgreementLive: false };
  return {
    lookups,
    market,
    turn,
    currentYear: gameState?.currentYear,
    commandEconomyEnabled: config?.commandEconomyEnabled === true,
    freightSettlementActive,
    supplyAgreementsEnabled,
    settleableAgreements: loaded,
    stateLocalClearingBlocked: loaded.legacyStateLocalAgreementLive,
    brandLoyaltyEnabled: config?.brandLoyaltyEnabled === true,
    brandLoyaltySliceEnabled:
      config?.brandLoyaltyEnabled === true && config?.brandLoyaltySliceEnabled === true,
    qualityPremiumPricingEnabled:
      config?.sectorQualityEnabled === true && config?.qualityPremiumPricingEnabled === true,
    treasuryCashLedgerEnabled: config?.treasuryCashLedgerEnabled === true,
  };
}

async function main() {
  const corpCount = Number(process.argv[2] ?? 2000);
  const sectorsPerCorp = Number(process.argv[3] ?? 7);
  const uri = process.env.AHD_PERF_MONGO_URI;
  let client: MongoClient | undefined;
  let db: Db | undefined;
  let world: PrePassWorld;
  let lookupRun: (() => Promise<unknown>) | undefined;
  const lookupOptions = {
    plantsEnabled: true,
    explicitPlantCostsEnabled: true,
  };

  if (uri) {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(process.env.MONGODB_DB ?? "a-house-divided");
    console.log(
      `lookup database: ${await db.collection("corporations").countDocuments({})} corporations, ` +
        `${await db.collection("corporateSectors").countDocuments({})} sectors`
    );
    const config = (await db
      .collection<GameConfig>("gameConfig")
      .findOne({ _id: "default" })) as GameConfig | null;
    const lookups = await buildCorporationLookups(db, {
      ...lookupOptions,
      productionTurn: Number(process.argv[4] ?? 0) || undefined,
    });
    world = await databaseWorld(db, lookups, config);
    lookupRun = () =>
      buildCorporationLookups(db!, {
        ...lookupOptions,
        productionTurn: Number(process.argv[4] ?? 0) || undefined,
      });
  } else {
    const fixture = buildProductionTurnWorld({
      corporations: corpCount,
      sectorsPerCorp,
      seed: 7,
      liveDocumentShape: true,
    });
    console.log(
      `fixture world: ${fixture.corporations.length} corporations, ${fixture.sectors.length} sectors`
    );
    world = fixtureWorld(fixture);
    console.log("AHD_PERF_MONGO_URI unset: skipping the lookup workload");
  }
  console.log(
    `pre-pass world: ${world.lookups.sectorsByCorp.size} corporations, turn ${world.turn}, ` +
      `clearing ${world.market.clearingEnabled}, plants ${world.market.plantsEnabled}, ` +
      `agreements ${world.supplyAgreementsEnabled}, loyalty ${world.brandLoyaltyEnabled}, ` +
      `freight ${world.freightSettlementActive}`
  );

  const freightArgs = {
    lookups: world.lookups,
    currentTurn: world.turn,
    plantsEnabled: world.market.plantsEnabled,
    currentYear: world.currentYear,
    commandEconomyEnabled: world.commandEconomyEnabled,
  };
  if (lookupRun) await time("buildLookups", 3, lookupRun);
  await time("clearingPrePass", 3, () => runClearingPrePass(prePassInput(world)));
  await time("freightBilling", 3, () => buildFreightBillingBySector(freightArgs));

  const profiled: { label: string; run: () => void | Promise<void> }[] = [];
  if (lookupRun) profiled.push({ label: "buildLookups", run: lookupRun });
  profiled.push(
    { label: "clearingPrePass", run: () => runClearingPrePass(prePassInput(world)) },
    { label: "freightBilling", run: () => buildFreightBillingBySector(freightArgs) }
  );

  const session = new Session();
  session.connect();
  await session.post("Profiler.enable");
  await session.post("Profiler.setSamplingInterval", { interval: 200 });
  mkdirSync("/tmp/opencode", { recursive: true });
  const tag = process.env.AHD_PERF_TAG ?? "before";
  for (const workload of profiled) {
    await workload.run();
    await session.post("Profiler.start");
    await workload.run();
    const { profile } = await session.post("Profiler.stop");
    const slug = workload.label.replace(/[^a-z0-9]+/gi, "-");
    writeFileSync(
      `/tmp/opencode/market-context-${slug}-${tag}-${corpCount}x${sectorsPerCorp}.cpuprofile`,
      JSON.stringify(profile)
    );
    print(workload.label, summarise(profile as CpuProfile));
  }
  session.disconnect();
  if (client) await client.close();
  console.log(`\nprofiles written to /tmp/opencode/market-context-*-${tag}-*`);
}

void main();
