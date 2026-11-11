import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import { COUNTRY_CONFIGS } from "@/lib/constants/countries";
import { getNationalManpowerCollection } from "@/lib/db/collections/nationalManpower";
import { resolveConscriptionStanceFor } from "@/lib/military/conscriptionLaw";
import { initialManpowerPool } from "@/lib/military/manpower";
import { statesCollection } from "@/lib/db/repositories/states";

/**
 * Seed every nation's replacement-manpower pool.
 *
 * Without this, two paths race to create the document four apart:
 * `applyReinforcement` reads missing as `pool: 0` and lands one turn's regen,
 * while procurement heals to the ceiling. Turns tick hourly, so the turn loop
 * wins and every nation stalls below what a small country needs to raise even
 * one formation.
 *
 * Covers all countries, matching `applyReinforcement`'s own iteration.
 *
 * Idempotent twice over:
 * 1. Skips countries with an existing document, so re-runs never refill spent
 *    manpower.
 * 2. Skips zero-population countries rather than writing `pool: 0`. Early
 *    seeding sees non-US countries without population yet; writing zero would
 *    poison rule 1 and leave every non-US nation at 0 forever.
 *
 * Call after the states seed and again after all region seeders. A country
 * with genuinely no regions stays absent and `ensureManpowerPool` heals it.
 */
export async function seedNationalManpower(
  db: Db,
  log: (message: string) => void = () => {}
): Promise<{ seeded: number; skipped: number; deferred: number }> {
  const col = getNationalManpowerCollection(db);
  const existing = await col.distinct("countryId");
  const already = new Set(existing.map(String));

  // One grouped read instead of a states scan per country.
  const populations = new Map<string, number>(
    (
      await statesCollection<{ countryId?: string; population?: number }>(db)
        .aggregate<{ _id: string; population: number }>([
          { $group: { _id: "$countryId", population: { $sum: "$population" } } },
        ])
        .toArray()
    ).map((row) => [String(row._id), row.population ?? 0])
  );

  let seeded = 0;
  let skipped = 0;
  let deferred = 0;
  for (const countryId of Object.keys(COUNTRY_CONFIGS) as CountryId[]) {
    if (already.has(countryId)) {
      skipped++;
      continue;
    }
    const population = populations.get(countryId) ?? 0;
    if (population <= 0) {
      // Its regions do not exist YET (or at all). Leave no document so a later
      // pass can still seed it — see rule 2 above.
      deferred++;
      continue;
    }
    const stance = await resolveConscriptionStanceFor(db, countryId);
    const pool = initialManpowerPool(population, stance.poolMult);
    // `mode` is written explicitly: NationalManpower requires it, and a document
    // created with only `{ countryId, pool }` violates its own type — after which
    // `applyReinforcement` reads `mode: undefined`, skips its "off" branch and
    // lands on trained-rate behaviour by accident rather than by decision.
    await col.updateOne(
      { countryId },
      { $setOnInsert: { countryId, pool, mode: "trained" } },
      { upsert: true }
    );
    seeded++;
  }

  log(
    `Seeded nationalManpower: seeded=${seeded}, skipped=${skipped}, ` +
      `deferred=${deferred} (no regions yet)`
  );
  return { seeded, skipped, deferred };
}
