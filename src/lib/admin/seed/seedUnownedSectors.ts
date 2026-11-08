import type { AnyBulkWriteOperation, Db } from "mongodb";
import { isBackgroundInPreset } from "@/lib/world/eraRoster";
import { ObjectId } from "mongodb";
import type { State } from "@/lib/db/types/state";
import type { UnownedSector } from "@/lib/db/types";
import { getCountryConfig } from "@/lib/constants/countries";
import type { CountryId } from "@/lib/constants/countries";
import {
  OPERATING_SECTOR_TYPES,
  operatingSectorIdentity,
  type OperatingSectorType,
} from "@/lib/constants/corporations";
import {
  MODERN_MIN_UNOWNED_SECTOR_REVENUE,
  getEraUnitScale,
  getMinUnownedSectorRevenue,
  getSectorSeedScale,
} from "@/lib/constants/sectorSeedEra";
import { getStateSectorWeights } from "@/lib/seeds/reference/sectorSeedWeights";
import { bucketKey } from "@/lib/nationalization/stateControlledBuckets";
import { incrementNatCorpSectorRevenue } from "@/lib/nationalization/seedToNatCorp";
import { computeUnownedHeadroomUnits } from "@/lib/market/unownedHeadroom";
import { reconcileCommandEconomyUnowned } from "@/lib/admin/seed/reconcileCommandEconomyUnowned";

/**
 * Modern-era floor. Kept as a named export for existing callers; the value a
 * given seed run actually applies is era-aware — see
 * {@link getMinUnownedSectorRevenue}.
 */
export const MIN_UNOWNED_SECTOR_REVENUE = MODERN_MIN_UNOWNED_SECTOR_REVENUE;
const UNOWNED_REVENUE_MULTIPLIER = 1.0;
// Per-country uplift removed — the UK 2.53x multiplier was a temporary fix for
// undersized seed revenue that caused runaway commodity supply dominance once
// those sectors were nationalized into the NatCorp and boosted by the auto-seeder.
const COUNTRY_UNOWNED_REVENUE_MULTIPLIER: Partial<Record<CountryId, number>> = {};

/**
 * Per-country, per-sector seed multiplier for DOWNSTREAM (input-consuming) industry:
 * additive capacity on top of the normalised sector-weight share, not a redistribution
 * of it.
 *
 * WHY A MULTIPLIER, NOT A WEIGHT BUMP. `computeUnownedSeedRevenue` sizes buckets from the
 * country's NORMALISED sector weight, so raising one weight lowers every other sector.
 * The DD problem is absolute downstream capacity against upstream supply, not mix shape;
 * re-weighting inside a fixed pie tops out near 1.4x.
 *
 * WHY DD, AND CONSTRUCTION FOR STEEL. CoCom embargo walls DD steel out of the West and
 * private founding is banned in a command economy, so no player can build the missing
 * consumers. Construction (Aufbau/Stalinallee, steel demand rate 0.15) is the real
 * downstream steel sink, multiplied x8 to soak the lignite-fed steel glut.
 *
 * WHY VEHICLES IS ONLY x2. Vehicles output cannot be sold: Warsaw Pact neighbours are
 * net-long vehicles and the West is embargoed, so extra output piles up unsold while auto
 * consumes only ~5% of DD steel demand. Cutting it back does not re-open the steel glut
 * construction is sized to close. x2 keeps a token IFA/Wartburg/Robur presence.
 *
 * `capitalStock` is derived from this same ₳ figure (see `buildSector`), so capacity and
 * revenue move together and no existing sector is cut.
 */
export const COUNTRY_SECTOR_SEED_MULTIPLIER: Partial<
  Record<CountryId, Partial<Record<OperatingSectorType, number>>>
> = {
  DD: {
    manufacturing_vehicles: 2,
    construction: 8,
  },
};

/** The downstream seed multiplier for one (country, operating lane); 1 when unset. */
export function countrySectorSeedMultiplier(countryId: CountryId, sectorType: string): number {
  const value = COUNTRY_SECTOR_SEED_MULTIPLIER[countryId]?.[sectorType as OperatingSectorType];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 1;
}

/**
 * Canonical market size (₳) for one (state, sectorType): shared by the seeder
 * and the 1991-recompute heal script. `gdp` is state GDP in local-currency
 * millions; `usdExchangeRate` normalizes it to ₳, the seed scale and sector
 * weight shape the market, result floored at the era minimum.
 *
 * Scale and floor are resolved per preset (see `constants/sectorSeedEra.ts`):
 * the floor is an absolute ₳ calibrated on modern nominal GDP, which pinned
 * every sector of half the 1953 world at the floor. Presets outside the era
 * table resolve the unchanged modern constants.
 */
export function computeUnownedSeedRevenue(params: {
  gdp: number;
  countryId: CountryId;
  stateId: string;
  sectorType: string;
  preset: string;
  boostMultiplier?: number;
}): number {
  const { gdp, countryId, stateId, sectorType, preset, boostMultiplier = 1 } = params;
  const { usdExchangeRate } = getCountryConfig(countryId, preset);
  const weights = getStateSectorWeights(stateId, countryId, preset);
  const base = Math.round(
    gdp *
      usdExchangeRate *
      getSectorSeedScale(preset) *
      (weights[sectorType as OperatingSectorType] ?? 0)
  );
  const countryMultiplier = COUNTRY_UNOWNED_REVENUE_MULTIPLIER[countryId] ?? 1;
  // Applied AFTER the era floor so the uplift is real capacity rather than
  // headroom the floor would have swallowed.
  const downstreamMultiplier = countrySectorSeedMultiplier(countryId, sectorType);
  return Math.round(
    Math.max(getMinUnownedSectorRevenue(preset), Math.round(base * UNOWNED_REVENUE_MULTIPLIER)) *
      countryMultiplier *
      downstreamMultiplier *
      boostMultiplier
  );
}

export async function seedUnownedSectors(
  db: Db,
  log: (msg: string) => void,
  boostMultiplier = 1,
  preset: string,
  // When true, recompute `revenue` for EXISTING docs too (not just inserts).
  // Safe only pre-play: a naive refresh resets a captured pool to full market.
  // For a live world with captured sectors, use the 1991-recompute heal script.
  refresh = false,
  /** Route (state, sectorType) buckets to the National Corporation instead of unowned. */
  redirectToNatCorpBuckets?: ReadonlySet<string>
) {
  // Background countries keep their regions but run no sectors.
  const states = (
    await db
      .collection<State>("states")
      .find({ _id: { $not: /^NATIONAL_/ } })
      .toArray()
  ).filter((state) => !isBackgroundInPreset(preset, state.countryId));

  const now = new Date();
  let inserted = 0;
  let redirected = 0;
  const ops: AnyBulkWriteOperation<UnownedSector>[] = [];
  // One market per operating lane. The vehicles and entertainment lanes are
  // sized by their own seed weights and stored under their canonical identity.
  const sectorMarkets = OPERATING_SECTOR_TYPES.map((lane) => ({
    lane,
    ...operatingSectorIdentity(lane),
  }));

  // Indexes FIRST, not after the loop. The upserts below filter on
  // {stateId, sectorType, industryModel}; with the index built afterwards every one of them is
  // a collection scan over a collection growing to ~3,800 docs (~7.4M document
  // examinations). That was invisible while each upsert cost a ~15ms round trip,
  // but the batched write below removes the latency the scan was hiding behind.
  await db
    .collection("unownedSectors")
    .createIndex(
      { stateId: 1, sectorType: 1, industryModel: 1, mediaDiscriminator: 1 },
      { name: "unowned_state_type_models_unique", unique: true, background: true }
    );
  await db.collection("unownedSectors").createIndex({ countryId: 1 });

  for (const state of states) {
    const countryId = state.countryId;

    for (const market of sectorMarkets) {
      const { lane, sectorType, industryModel, mediaDiscriminator } = market;
      const bucket = bucketKey(state._id as string, sectorType, industryModel, mediaDiscriminator);
      const seedRevenue = computeUnownedSeedRevenue({
        gdp: state.gdp,
        countryId: countryId as CountryId,
        stateId: state._id as string,
        sectorType: lane,
        preset,
        boostMultiplier,
      });

      if (redirectToNatCorpBuckets?.has(bucket)) {
        const result = await incrementNatCorpSectorRevenue(db, {
          countryId: countryId as CountryId,
          stateId: state._id as string,
          sectorType,
          industryModel,
          mediaDiscriminator,
          revenueDelta: seedRevenue,
        });
        if (result !== "noop") redirected++;
        continue;
      }
      // Identity fields are immutable; mutable fields (revenue/countryId/updatedAt)
      // go in $set only on refresh so $set and $setOnInsert never share a key.
      const identity = {
        _id: new ObjectId(),
        stateId: state._id as string,
        sectorType,
        industryModel,
        mediaDiscriminator,
        createdAt: now,
      };
      // Batched (this branch) AND carrying the derived headroom field
      // (development). `headroomUnits` is DERIVED from revenue and must be
      // written in the SAME operation, or it is left describing a revenue
      // figure that no longer exists — `plants` reads it as the market
      // denominator. The batching changes the number of round trips, not what
      // each document ends up holding.
      const headroomUnits = computeUnownedHeadroomUnits(
        sectorType,
        seedRevenue,
        getEraUnitScale(preset),
        industryModel,
        mediaDiscriminator
      );
      ops.push({
        updateOne: {
          filter: {
            stateId: state._id as string,
            sectorType,
            industryModel,
            mediaDiscriminator,
          },
          update: refresh
            ? {
                $set: { revenue: seedRevenue, headroomUnits, countryId, updatedAt: now },
                $setOnInsert: identity,
              }
            : {
                $setOnInsert: {
                  ...identity,
                  countryId,
                  revenue: seedRevenue,
                  headroomUnits,
                  updatedAt: now,
                },
              },
          upsert: true,
        },
      });
    }
  }

  // `ordered: true` preserves the sequential semantics this replaced: ops apply
  // in loop order, and a failure skips the remainder exactly as a thrown await
  // did. The win here is round trips, not server-side parallelism.
  if (ops.length > 0) {
    const result = await db
      .collection<UnownedSector>("unownedSectors")
      .bulkWrite(ops, { ordered: true });
    inserted = result.upsertedCount;
  }

  const redirectNote = redirected > 0 ? `, routed ${redirected} to national corporations` : "";
  log(
    `Seeded ${inserted} unowned sector docs (${states.length} states × ${sectorMarkets.length} market models${redirectNote})`
  );

  // Command economies seed SOEs at full market size, then this seeder also
  // inserts a full unowned twin — ownership lands near ~50% and non-SOE
  // sectors stay unreachable ghosts. Drain after the upserts.
  await reconcileCommandEconomyUnowned(db, { preset, log });
}
