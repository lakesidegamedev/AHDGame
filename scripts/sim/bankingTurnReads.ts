/** Bounded synthetic replay. No network or production database access. */
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { createInMemoryDb } from "../../src/lib/test-utils/inMemoryDb";
import { ALL_COUNTRY_IDS } from "../../src/lib/constants/countries";
import {
  getLegalCharterTypes,
  loadLegalCharterTypesForCountries,
} from "../../src/lib/banking/separationLaw";

async function replay(year: number) {
  const memory = createInMemoryDb();
  memory.seed("gameState", [
    {
      _id: "current",
      currentYear: year,
      currentTurn: 100,
      startingYear: year,
      preset: `${year}-default`,
    },
  ]);
  memory.seed("gameConfig", [{ _id: "default", commandEconomyEnabled: true }]);
  memory.seed("bankingLaws", [
    { _id: "US", separation: "universal", enactedTurn: 50 },
    { _id: "UK", separation: "separated", enactedTurn: 50 },
  ]);
  let reads = 0;
  // Count API calls independently of overlap between the concurrent reads.
  for (const name of ["gameState", "gameConfig", "bankingLaws"]) {
    const collection = memory.collection(name);
    for (const method of ["find", "findOne"] as const) {
      const original = collection[method].bind(collection);
      Reflect.set(collection, method, (...args: unknown[]) => {
        reads++;
        return Reflect.apply(original, collection, args);
      });
    }
  }
  const db = memory as unknown as Db;
  const scalar = new Map();
  for (const country of ALL_COUNTRY_IDS)
    scalar.set(country, await getLegalCharterTypes(db, country));
  const scalarReads = reads;
  reads = 0;
  const batched = await loadLegalCharterTypesForCountries(db, ALL_COUNTRY_IDS);
  assert.deepEqual(batched, scalar);
  return {
    year,
    countries: ALL_COUNTRY_IDS.length,
    scalarReads,
    batchedReads: reads,
    identical: true,
  };
}

async function main() {
  for (const year of [1991, 2019]) console.log(JSON.stringify(await replay(year)));
}

main().catch(() => {
  console.error("Banking read replay failed.");
  process.exitCode = 1;
});
