/**
 * Recompute the cached region lean (`states` and `stateDemographics`
 * `cachedEconomicLean` / `cachedSocialLean`) from the census electorate, with
 * the same context the turn processor uses. The turn only rewrites a region's
 * cache when that region's demographics change, so a calibration change needs
 * this one pass to reach maps, region pages and the home-state picker.
 *
 * Dry run by default; prints old and new values. `--apply` writes.
 *
 * Usage: npx tsx scripts/seed/refresh-cached-state-lean.ts --countries US,CA [--apply]
 */
import { connectDb, closeDb } from "../utils/db";
import type { CountryId } from "../../src/lib/constants/countries";
import { censusCachedStateLean } from "../../src/lib/demographics/cachedStateLean";
import { getGameStateCollection } from "../../src/lib/db/collections/gameState";
import { statesCollection } from "../../src/lib/db/repositories/states";
import { stateDemographicsCollection } from "../../src/lib/db/repositories/stateDemographics";
import { demographicDefaultsCollection } from "../../src/lib/db/repositories/demographicDefaults";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const countries = (arg("--countries") ?? "").split(",").filter(Boolean) as CountryId[];
  if (countries.length === 0) throw new Error("Pass --countries, e.g. --countries US,CA");
  const apply = process.argv.includes("--apply");
  const db = await connectDb();
  try {
    const gameState = await (
      await getGameStateCollection(db)
    ).findOne({ _id: "current" }, { projection: { preset: 1, currentYear: 1, startingYear: 1 } });
    const [demographics, defaults, states] = await Promise.all([
      stateDemographicsCollection(db)
        .find({ countryId: { $in: countries } })
        .toArray(),
      demographicDefaultsCollection(db)
        .find({ countryId: { $in: countries } })
        .toArray(),
      statesCollection(db)
        .find({ countryId: { $in: countries } }, { projection: { _id: 1 } })
        .toArray(),
    ]);
    const defaultsById = new Map(defaults.map((d) => [d._id, d]));
    const stateIds = new Set(states.map((s) => s._id));
    let changed = 0;
    for (const demo of demographics) {
      const lean = censusCachedStateLean(demo, {
        countryId: demo.countryId,
        stateId: demo._id,
        preset: gameState?.preset,
        demographicDefaults: defaultsById.get(demo._id),
        year: gameState?.currentYear ?? null,
        startingYear: gameState?.startingYear,
      });
      if (!lean) continue;
      const before = `${demo.cachedEconomicLean?.toFixed(2)}/${demo.cachedSocialLean?.toFixed(2)}`;
      const after = `${lean.economicLean.toFixed(2)}/${lean.socialLean.toFixed(2)}`;
      console.log(`${demo.countryId} ${demo._id}: ${before} -> ${after}`);
      if (!apply) continue;
      const set = { cachedEconomicLean: lean.economicLean, cachedSocialLean: lean.socialLean };
      await stateDemographicsCollection(db).updateOne(
        { _id: demo._id },
        { $set: { ...set, lastUpdated: new Date() } }
      );
      if (stateIds.has(demo._id)) {
        await statesCollection(db).updateOne(
          { _id: demo._id },
          { $set: { ...set, demographicsLastUpdated: new Date() } }
        );
      }
      changed++;
    }
    console.log(apply ? `Updated ${changed} regions.` : "Dry run. Re-run with --apply to write.");
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
