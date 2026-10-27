/**
 * Production-shape equivalence gate for the corporation turn.
 *
 * The turn must produce byte-identical writes no matter how its per-sector CPU
 * work is restructured. A golden capture recorded from the unmodified code pins
 * every sector `$set`, every corporation update and every payment map on a
 * seeded world with the production shape (many corporations, several sectors
 * each, plants + clearing + internal supply on).
 *
 * The same world feeds the producer-market shadow: its turn summary and the
 * carry state it hands to the next turn are captured too, so a cheaper
 * isolation or document copy cannot change what the shadow computes.
 *
 * It also feeds the two substeps that precede the sector pass: the clearing
 * pre-pass (fills, own-group reservations, receipts, advertising value,
 * contract targets) and the lookup builder (every per-sector and per-state
 * table the turn reads). Both are hashed here so a cheaper clear or lookup
 * build must hand back exactly the same numbers.
 *
 * Regenerate only for an intended behaviour change:
 *   UPDATE_TURN_GOLDEN=1 npx vitest run src/lib/turn/corporation/__fixtures__/productionTurn.golden.test.ts
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import type { CommodityType } from "@/lib/constants/commodities";
import type { CorporationLookups } from "../types";
import { processSectors } from "../sectorCalculations";
import { runProducerMarketShadowPhase } from "../producerMarketShadowPhase";
import { buildCorporationLookups } from "../buildLookups";
import { runClearingPrePass } from "../clearingPrePass";
import { buildProductionTurnWorld } from "./productionTurnWorld";
import {
  captureClearing,
  captureLookups,
  captureProducerShadow,
  captureTurn,
} from "./productionTurnCapture";

// The lookup builder resolves the extraction output-scale flag through `getDb`;
// the fixture world supplies the documents instead.
vi.mock("@/lib/mongodb", () => ({ getDb: vi.fn() }));

const GOLDEN = join(__dirname, "productionTurn.golden.json");
const SHADOW_EPOCH = "golden-world";
const STATES = [
  "US-CA",
  "US-TX",
  "US-NY",
  "US-IL",
  "US-FL",
  "US-OH",
  "US-PA",
  "US-GA",
  "US-MI",
  "US-NC",
];

function runTurn() {
  const world = buildProductionTurnWorld({ corporations: 60, sectorsPerCorp: 7, seed: 7 });
  const result = processSectors(
    world.lookups,
    world.turn,
    world.now,
    true,
    1991,
    world.labour,
    world.market
  );
  return { world, result, capture: captureTurn(result as Parameters<typeof captureTurn>[0]) };
}

/**
 * Run the shadow phase over the same world and capture what it persisted. The
 * in-memory database only carries the states and the federal budget the phase
 * reads; everything else is the fixture's lookups.
 */
async function runShadow() {
  const { world, result } = runTurn();
  const memory = createInMemoryDb();
  memory.seed(
    "states",
    STATES.map((stateId) => ({ _id: stateId, countryId: "US", gdp: 900_000 }))
  );
  const lookups = {
    ...world.lookups,
    // The sector loop's lookups do not carry these; the shadow's plant
    // preparation and reference prices read them.
    eraUnitScale: 1,
    eraYear: 1991,
    federalBudgets: [
      {
        countryId: "US",
        currencyCode: "USD",
        spending: { byCategory: { healthcare: 700_000_000, defense: 420_000_000 } },
      },
    ],
  } as unknown as CorporationLookups;
  await runProducerMarketShadowPhase(memory as unknown as Db, {
    enabled: true,
    turn: world.turn,
    worldEpoch: SHADOW_EPOCH,
    lookups,
    env: { ...result.sectorTurnEnv, lookups },
    sectorOps: result.sectorOps,
  });
  const summary = await memory.collection("producerMarketShadows").findOne({});
  const state = await memory.collection("producerMarketShadowState").findOne({});
  return captureProducerShadow({
    summary: summary as Record<string, unknown> | null,
    state: state as Record<string, unknown> | null,
  });
}

/**
 * Run the clearing pre-pass over the same world. The flags match a live plants
 * world: clearing on, own-group sourcing on (the fixture gives corporations an
 * internal supply policy), brand loyalty on. State books are live because the
 * fixture carries per-state balances, so state-scoped commodities clear in one
 * book per state exactly as they do in production.
 */
function runClearing() {
  const world = buildProductionTurnWorld({ corporations: 60, sectorsPerCorp: 7, seed: 7 });
  const lookups = {
    ...world.lookups,
    eraUnitScale: 1,
    eraYear: 1991,
  } as unknown as CorporationLookups;
  const market = { ...world.market };
  const result = runClearingPrePass({
    lookups,
    market,
    turn: world.turn,
    currentYear: 1991,
    commandEconomyEnabled: false,
    freightSettlementActive: false,
    supplyAgreementsEnabled: false,
    settleableAgreements: undefined,
    contractedByCorpCommodity: new Map(),
    contractSettlementByCorp: new Map(),
    producedByCorpCommodity: new Map(),
    achievableByCorpCommodity: new Map(),
    stateLocalClearingBlockedByLegacyAgreement: false,
    brandLoyaltyEnabled: true,
    brandLoyaltySliceEnabled: true,
    qualityPremiumPricingEnabled: false,
    treasuryCashLedgerEnabled: false,
    fundedProducerTurn: false,
  });
  return captureClearing(market, result);
}

/**
 * Build the lookups from the same world's documents. The in-memory database
 * returns them as the driver would, so the builder's own grouping, market
 * share and margin tables are what the golden pins.
 */
async function runLookups() {
  const world = buildProductionTurnWorld({ corporations: 60, sectorsPerCorp: 7, seed: 7 });
  const memory = createInMemoryDb();
  memory.seed("corporations", world.corporations as unknown as Record<string, unknown>[]);
  memory.seed("corporateSectors", world.sectors as unknown as Record<string, unknown>[]);
  memory.seed(
    "states",
    STATES.map((stateId) => ({ _id: stateId, countryId: "US", gdp: 900_000 }))
  );
  memory.seed("gameState", [
    {
      _id: "current",
      preset: "2019-default",
      currentTurn: world.turn,
      currentYear: 1991,
      startingYear: 1991,
      worldEpochId: "golden-world",
    },
  ]);
  memory.seed("exchangeRates", [{ currencyCode: "USD", rate: 1 }]);
  memory.seed("federalBudget", [
    {
      _id: "federal",
      countryId: "US",
      gdp: 30_000_000_000_000,
      surplus: -900_000,
      debtToGdpRatio: 0.9,
      taxRates: { domesticCorporateTax: 21, foreignCorporateTax: 21 },
      economicFactors: { inflationRate: 2.1 },
    },
  ]);
  memory.seed(
    "stateBudgets",
    STATES.map((stateId) => ({
      _id: stateId,
      taxRates: { domesticCorporateTax: 5, foreignCorporateTax: 5 },
    }))
  );
  memory.seed("centralBanks", [
    {
      _id: "US",
      countryId: "US",
      primeRate: 3.5,
      primeRateSmoothed: 3.4,
      memberCountries: ["US"],
    },
  ]);
  memory.seed(
    "commodityPrices",
    (["steel", "oil", "freight", "advertising"] as CommodityType[]).map((commodity, i) => ({
      _id: commodity,
      commodity,
      turn: world.turn - 1,
      basePrice: 100 + i,
      globalPrice: 104 + i,
      globalSupply: 1_000_000 + i * 10_000,
      globalDemand: 980_000 + i * 10_000,
      stateSupply: Object.fromEntries(STATES.map((state, j) => [state, 100_000 + i + j])),
      stateDemand: Object.fromEntries(STATES.map((state, j) => [state, 98_000 + i + j])),
      statePrices: Object.fromEntries(STATES.map((state) => [state, 102 + i])),
      stateInputAvailability: Object.fromEntries(STATES.map((state) => [state, 0.95])),
      nationalSupply: { US: 1_000_000 + i * 10_000 },
      nationalDemand: { US: 980_000 + i * 10_000 },
      reachablePrices: { US: 103 + i },
    }))
  );
  const { getDb } = await import("@/lib/mongodb");
  vi.mocked(getDb).mockResolvedValue(memory as unknown as Db);
  const lookups = await buildCorporationLookups(memory as unknown as Db, {
    plantsEnabled: true,
    explicitPlantCostsEnabled: true,
    productionTurn: world.turn,
  });
  return captureLookups(lookups);
}

type Golden = {
  shadow?: unknown;
  clearing?: unknown;
  lookups?: unknown;
};

/** The turn capture's own fields; the golden also carries the other substeps. */
const TURN_KEYS = [
  "sectors",
  "sectorOps",
  "corpOps",
  "totalRevenueGenerated",
  "totalIncomeGenerated",
  "sectorsProcessed",
  "sha256",
] as const;

function readGolden(): Golden {
  return JSON.parse(readFileSync(GOLDEN, "utf8")) as Golden;
}

function goldenTurn(golden: Golden): Record<string, unknown> {
  const rows = golden as Record<string, unknown>;
  return Object.fromEntries(TURN_KEYS.map((key) => [key, rows[key]]));
}

function writeGolden(patch: Record<string, unknown>) {
  writeFileSync(GOLDEN, JSON.stringify({ ...readGolden(), ...patch }, null, 2) + "\n");
}

describe("corporation turn golden capture", () => {
  it("reproduces the recorded writes exactly", () => {
    const { capture } = runTurn();
    if (process.env.UPDATE_TURN_GOLDEN === "1") {
      writeGolden(capture);
      return;
    }
    expect(capture).toEqual(goldenTurn(readGolden()));
  });

  it("processes every sector and books non-zero money", () => {
    const { capture } = runTurn();
    expect(capture.sectorsProcessed).toBe(420);
    expect(capture.sectorOps).toBe(420);
    expect(capture.corpOps).toBeGreaterThan(0);
    expect(capture.totalRevenueGenerated).toBeGreaterThan(0);
  });

  it("reproduces the recorded producer-market shadow exactly", async () => {
    const capture = await runShadow();
    if (process.env.UPDATE_TURN_GOLDEN === "1") {
      writeGolden({ shadow: capture });
      return;
    }
    expect(capture).toEqual(readGolden().shadow);
  });

  it("reproduces the recorded clearing pre-pass exactly", () => {
    const capture = runClearing();
    if (process.env.UPDATE_TURN_GOLDEN === "1") {
      writeGolden({ clearing: capture });
      return;
    }
    expect(capture).toEqual(readGolden().clearing);
  });

  it("reproduces the recorded lookups exactly", async () => {
    const capture = await runLookups();
    if (process.env.UPDATE_TURN_GOLDEN === "1") {
      writeGolden({ lookups: capture });
      return;
    }
    expect(capture).toEqual(readGolden().lookups);
  });

  it("settles the shadow market against the live world", async () => {
    const capture = await runShadow();
    expect(capture.plants).toBeGreaterThan(0);
    expect(capture.skipped).toBe(0);
    expect(capture.prices).toBeGreaterThan(0);
    expect(capture.householdSpend).toBeGreaterThan(0);
    expect(capture.carriedPlants).toBeGreaterThan(0);
    expect(capture.accounts).toBeGreaterThan(0);
  });
});
