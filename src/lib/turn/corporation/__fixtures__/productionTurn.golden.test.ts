/**
 * Production-shape equivalence gate for the corporation turn.
 *
 * The turn must produce byte-identical writes no matter how its per-sector CPU
 * work is restructured. A golden capture recorded from the unmodified code pins
 * every sector `$set`, every corporation update and every payment map on a
 * seeded world with the production shape (many corporations, several sectors
 * each, plants + clearing + internal supply on).
 *
 * Regenerate only for an intended behaviour change:
 *   UPDATE_TURN_GOLDEN=1 npx vitest run src/lib/turn/corporation/__fixtures__/productionTurn.golden.test.ts
 */
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { processSectors } from "../sectorCalculations";
import { buildProductionTurnWorld } from "./productionTurnWorld";
import { captureTurn } from "./productionTurnCapture";

const GOLDEN = join(__dirname, "productionTurn.golden.json");

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
  return captureTurn(result as Parameters<typeof captureTurn>[0]);
}

describe("corporation turn golden capture", () => {
  it("reproduces the recorded writes exactly", () => {
    const capture = runTurn();
    if (process.env.UPDATE_TURN_GOLDEN === "1") {
      writeFileSync(GOLDEN, JSON.stringify(capture, null, 2) + "\n");
      return;
    }
    const golden = JSON.parse(readFileSync(GOLDEN, "utf8")) as typeof capture;
    expect(capture).toEqual(golden);
  });

  it("processes every sector and books non-zero money", () => {
    const capture = runTurn();
    expect(capture.sectorsProcessed).toBe(420);
    expect(capture.sectorOps).toBe(420);
    expect(capture.corpOps).toBeGreaterThan(0);
    expect(capture.totalRevenueGenerated).toBeGreaterThan(0);
  });
});
