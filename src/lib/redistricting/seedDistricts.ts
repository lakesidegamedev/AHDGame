import type { Db } from "mongodb";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import type { CongressionalDistrict } from "@/lib/db/types";
import { buildDistrictDocsForStates } from "./buildStateDocs";
import { seedRedistrictingAuthority } from "./seedRedistrictingAuthority";
import { congressionalDistrictsCollection } from "@/lib/db/repositories/congressionalDistricts";
import type { Document } from "mongodb";
import { seedOpeningHouseHolders } from "./seedOpeningHolders";

interface SeedOpts {
  countryId?: CountryId;
  preset?: string;
  now: Date;
  log?: (m: string) => void;
}

/**
 * Seed `congressionalDistricts` for every state of `countryId` (default "US").
 * Idempotent — upserts by `_id`. The shared per-state builder does the reads +
 * pure math; this only persists.
 */
export async function seedCongressionalDistricts(
  db: Db,
  opts: SeedOpts
): Promise<{ seeded: number }> {
  const countryId = (opts.countryId ?? "US") as CountryId;
  const log = opts.log ?? (() => {});

  const docs = await buildDistrictDocsForStates(db, countryId, opts.now, undefined, opts.preset);
  if (docs.length > 0) {
    await congressionalDistrictsCollection(db).bulkWrite(
      docs.map((doc) => ({
        updateOne: { filter: { _id: doc._id }, update: { $set: doc }, upsert: true },
      })),
      { ordered: true }
    );
  }
  const seeded = docs.length;
  if (countryId === COUNTRY_CONFIGS.US.id) await seedOpeningHouseHolders(db, opts.preset, log);

  await congressionalDistrictsCollection<Document>(db)
    .createIndex({ countryId: 1, stateId: 1, index: 1 }, { unique: true })
    .catch(() => {});

  log(`Seeded ${seeded} congressional districts (${countryId})`);

  // Seed the authority law to legislature-drawn for every state that got
  // districts. Without this the redistricting feature is unreachable (the code
  // default is bipartisan commission, which cannot redraw) and the default is
  // historically wrong for the 1953/1960 eras.
  await seedRedistrictingAuthority(db, {
    countryId,
    stateIds: docs.map((d) => d.stateId),
    now: opts.now,
    log,
  });

  return { seeded };
}
