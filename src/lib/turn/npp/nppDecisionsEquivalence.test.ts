/**
 * Equivalence gate for the NPP corporation decision phase.
 *
 * `processNppCorporationDecisions` is the most expensive CPU phase of the
 * corporation turn, so it gets refactored for speed regularly. A refactor that
 * changes even one decision is a balance change to a live economy, and a
 * changed decision is invisible in a passing spot-check (same orders, minus
 * one). This pins every output: each run against the same fixture must hash
 * identically to the recorded golden, corporation by corporation.
 *
 * Regenerate deliberately, only when a change is INTENDED to move decisions,
 * and say so in the PR:
 *
 *   AHD_NPP_WRITE_GOLDEN=1 npx vitest run src/lib/turn/npp/nppDecisionsEquivalence.test.ts
 *
 * Timing for the before/after report (printed, never asserted, so a busy host
 * cannot fail the build):
 *
 *   AHD_NPP_BENCH=1 npx vitest run src/lib/turn/npp/nppDecisionsEquivalence.test.ts
 */
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { seedNppDecisionsWorld, type NppDecisionsWorld } from "./__fixtures__/nppDecisionsWorld";
import { captureNppDecisions, type NppDecisionsCapture } from "./__fixtures__/nppDecisionsCapture";

const GOLDEN_PATH = fileURLToPath(
  new URL("./__fixtures__/nppDecisions.golden.json", import.meta.url)
);

interface Golden {
  fixture: { corporations: number; nppCorporations: number; seed: string; turn: number };
  capture: NppDecisionsCapture;
}

const FIXTURE = {
  corporations: 2_000,
  nppCorporations: 400,
  seed: "npp-decisions-equivalence",
  turn: 458,
} as const;

let first: { world: NppDecisionsWorld; capture: NppDecisionsCapture; ms: number };

async function runOnce(): Promise<{
  world: NppDecisionsWorld;
  capture: NppDecisionsCapture;
  ms: number;
}> {
  const world = await seedNppDecisionsWorld(FIXTURE);
  const started = performance.now();
  const capture = await captureNppDecisions(world.db, world, true);
  return { world, capture, ms: performance.now() - started };
}

beforeAll(async () => {
  first = await runOnce();
}, 900_000);

describe("NPP corporation decisions are unchanged", () => {
  it("matches the recorded golden decision for decision", { timeout: 900_000 }, async () => {
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as Golden;
    expect(golden.fixture).toEqual({ ...FIXTURE });

    if (process.env.AHD_NPP_WRITE_GOLDEN === "1") {
      writeFileSync(
        GOLDEN_PATH,
        `${JSON.stringify({ fixture: { ...FIXTURE }, capture: first.capture }, null, 2)}\n`
      );
      return;
    }

    const changed = Object.keys({ ...golden.capture.corps, ...first.capture.corps }).filter(
      (corpId) => golden.capture.corps[corpId] !== first.capture.corps[corpId]
    );
    expect(
      changed,
      `corporations whose decision changed: ${changed.slice(0, 10).join(", ")}`
    ).toEqual([]);
    expect(first.capture.counts).toEqual(golden.capture.counts);
    expect(first.capture.unowned).toBe(golden.capture.unowned);
    expect(first.capture.digest).toBe(golden.capture.digest);
    if (process.env.AHD_NPP_BENCH === "1") {
      console.log(
        `nppCorpDecisions ${first.ms.toFixed(0)}ms ${JSON.stringify(first.capture.counts)}`
      );
    }
  });

  it("is deterministic run to run", { timeout: 900_000 }, async () => {
    const second = await runOnce();
    expect(second.capture.counts).toEqual(first.capture.counts);
    expect(second.capture.digest).toBe(first.capture.digest);
    if (process.env.AHD_NPP_BENCH === "1") {
      console.log(`nppCorpDecisions second run ${second.ms.toFixed(0)}ms`);
    }
  });
});
