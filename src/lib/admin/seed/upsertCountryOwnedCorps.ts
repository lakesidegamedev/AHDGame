import type { AnyBulkWriteOperation, Db, ObjectId } from "mongodb";
import type { Corporation, CorporateSector } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";
import type { CountryOwnedSeedData } from "@/lib/seeds/reference/budgets";

export interface CountryOwnedCorpUpsertResult {
  /** Corporations upserted by canonical `_id`. */
  corporations: number;
  /** Producing sectors upserted at their canonical owner. */
  sectors: number;
  /**
   * Existing producing sectors moved off a STALE country-owned corporation onto
   * the canonical one, instead of being duplicated beside it.
   */
  repointed: number;
}

/**
 * Upsert a country's country-owned corporations and their producing
 * `corporateSectors`, tolerating SOE ids from an earlier id layout.
 *
 * SOE ids derive from a per-country hex base plus the sector's `CORPORATION_TYPES`
 * ordinal, and that base has changed. A re-seed of a world seeded under an older
 * layout leaves sectors on stale owners, so a naive
 * `{ corporationId, stateId, sectorType }` upsert can never match one and INSERTS a
 * duplicate producing row, double-counting supply, capacity and workers.
 *
 * So: re-point first, then upsert. A sector is moved only when its current owner is
 * another COUNTRY-OWNED corporation of the SAME country (read back from the DB, not
 * guessed), so no player or nationalised corp loses a sector. Re-pointing is skipped
 * when the canonical owner already has that (region, sector type) row, to avoid
 * recreating the duplicate; such leftovers are reported, not deleted.
 */
export async function upsertCountryOwnedCorpEntries(
  db: Db,
  countryId: CountryId,
  entries: CountryOwnedSeedData[]
): Promise<CountryOwnedCorpUpsertResult> {
  const result: CountryOwnedCorpUpsertResult = { corporations: 0, sectors: 0, repointed: 0 };
  if (entries.length === 0) return result;

  const corpOps: AnyBulkWriteOperation<Corporation>[] = [];
  for (const entry of entries) {
    const { _id: corpId, ...corpData } = entry.corporation;
    corpOps.push({
      updateOne: { filter: { _id: corpId }, update: { $set: corpData }, upsert: true },
    });
  }
  // Corporations before sectors: a sector's owning corporation always exists first.
  await db.collection<Corporation>("corporations").bulkWrite(corpOps, { ordered: true });
  result.corporations = corpOps.length;

  // Only corporations that get producing sectors this run are legitimate
  // sector owners. The bare sovereign issuer has `sectors: []`, so sectors
  // on it are the pre-SOE-split shape (`sectorsOnPrimaryCorp`).
  const canonicalSectorOwnerIds = new Set(
    entries
      .filter((entry) => entry.sectors.length > 0)
      .map((entry) => String(entry.corporation._id))
  );
  // Read back AFTER the corporation upsert so the canonical ids are present and
  // anything else still flagged as country-owned is, by definition, from an
  // older id layout.
  const countryOwnedIds = (
    await db
      .collection<Corporation>("corporations")
      .find({ countryOwnerId: countryId }, { projection: { _id: 1 } })
      .toArray()
  ).map((corp) => corp._id as ObjectId);
  const staleOwnerIds = countryOwnedIds.filter((id) => !canonicalSectorOwnerIds.has(String(id)));

  const sectors = db.collection<CorporateSector>("corporateSectors");
  const sectorOps: AnyBulkWriteOperation<CorporateSector>[] = [];

  for (const entry of entries) {
    const corpId = entry.corporation._id;
    for (const sector of entry.sectors) {
      if (staleOwnerIds.length > 0) {
        const canonicalExists = await sectors.countDocuments(
          { corporationId: corpId, stateId: sector.stateId, sectorType: sector.sectorType },
          { limit: 1 }
        );
        if (canonicalExists === 0) {
          const moved = await sectors.updateOne(
            {
              countryId,
              stateId: sector.stateId,
              sectorType: sector.sectorType,
              corporationId: { $in: staleOwnerIds },
            },
            { $set: { corporationId: corpId } }
          );
          result.repointed += moved.modifiedCount;
        }
      }

      const { _id: _sectorId, ...sectorData } = sector;
      sectorOps.push({
        updateOne: {
          filter: { corporationId: corpId, stateId: sector.stateId, sectorType: sector.sectorType },
          update: { $set: sectorData },
          upsert: true,
        },
      });
    }
  }

  if (sectorOps.length > 0) {
    await sectors.bulkWrite(sectorOps, { ordered: true });
    result.sectors = sectorOps.length;
  }

  return result;
}
