import type { Db } from "mongodb";
import type { StateDemographics } from "@/lib/db/types";
import { buildModelRegionDemographics } from "@/lib/seeds/international";
import {
  getSuccessor1991Model,
  type Successor1991CountryId,
} from "@/lib/seeds/international/successor1991";
import { stateDemographicsCollection } from "@/lib/db/repositories/stateDemographics";

const COUNTRY_IDS: Successor1991CountryId[] = ["RU", "PL", "CS", "HU", "RO", "BG", "YU"];
/** Seed period-specific voter models before defaults and turnout snapshots. */
export async function seedSuccessorDemographics1991(
  db: Db,
  reset: boolean,
  preset: string,
  log: (message: string) => void
): Promise<void> {
  if (preset !== "1991-default") return;
  const models = COUNTRY_IDS.map(getSuccessor1991Model);
  if (reset) {
    await stateDemographicsCollection(db).deleteMany({ countryId: { $in: COUNTRY_IDS } });
  }
  const rows = models.flatMap((model) => buildModelRegionDemographics(model));
  await stateDemographicsCollection(db).bulkWrite(
    rows.map(({ _id, ...row }) => ({
      updateOne: { filter: { _id }, update: { $set: row }, upsert: true },
    }))
  );
  log(`Seeded ${rows.length} January 1991 transition demographic regions`);
}
