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
 * Regenerate only for an intended behaviour change:
 *   UPDATE_TURN_GOLDEN=1 npx vitest run src/lib/turn/corporation/__fixtures__/productionTurn.golden.test.ts
 */
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "mongodb";
import { createInMemoryDb } from "@/lib/test-utils/inMemoryDb";
import type { CorporationLookups } from "../types";
import { processSectors } from "../sectorCalculations";
import { runProducerMarketShadowPhase } from "../producerMarketShadowPhase";
import { buildProductionTurnWorld } from "./productionTurnWorld";
import { captureProducerShadow, captureTurn } from "./productionTurnCapture";

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

describe("corporation turn golden capture", () => {
  it("reproduces the recorded writes exactly", () => {
    const { capture } = runTurn();
    if (process.env.UPDATE_TURN_GOLDEN === "1") {
      writeFileSync(GOLDEN, JSON.stringify(capture, null, 2) + "\n");
      return;
    }
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as typeof capture & {
      shadow?: unknown;
    };
    const { shadow: _shadow, ...turn } = golden;
    expect(capture).toEqual(turn);
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
      const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, unknown> & {
        shadow?: unknown;
      };
      writeFileSync(GOLDEN, JSON.stringify({ ...golden, shadow: capture }, null, 2) + "\n");
      return;
    }
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as { shadow: typeof capture };
    expect(capture).toEqual(golden.shadow);
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
