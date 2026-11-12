/**
 * Seeded competitors fill player and economy-preview markets without duplicates.
 * seedNppCorporations follows preset access, excludes planned economies, and
 * consumes available market capacity. Player miners use supported deposits.
 */

import { isBackgroundInPreset } from "@/lib/world/eraRoster";
import { isExcludedPreset, type PresetExclusions } from "@/lib/seeds/presetExclusions";
import type { Db } from "mongodb";
import type { StateResourceCapacity } from "@/lib/db/types/stateResourceCapacity";
import { chooseSeedExtractionSite } from "@/lib/extraction/rules/seedPlacement";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import type { Corporation } from "@/lib/db/types";
import {
  OPERATING_SECTOR_TYPES,
  operatingSectorIdentity,
  type OperatingSectorType,
} from "@/lib/constants/corporations";
import { getOperatingSectorType } from "@/lib/constants/sectorStrategies";
import { getEraUnitScale } from "@/lib/constants/sectorSeedEra";
import { computeUnownedSeedRevenue } from "@/lib/admin/seed/seedUnownedSectors";
import { nppSeedRevenueCap } from "@/lib/admin/seed/rules/nppSeedCapacity";
import { foundingStarterUnits } from "@/lib/corporations/foundingPlant";
import { revenuePerCapacityUnit } from "@/lib/constants/capacityEconomy";
import type { State } from "@/lib/db/types/state";
import {
  getPresetEnablementCountries,
  getPresetEnablementTier,
} from "@/lib/admin/seed/seedCountryGameStates";
import { scheduledMarketizationLevel, DUAL_TRACK_CEILING } from "@/lib/constants/commandEconomy";
import { batchSpawnNppCorporations, NPP_CAPITAL_STATES } from "@/lib/admin/spawnNppCorporation";
import { corporationsCollection } from "@/lib/db/repositories/corporations";
import { statesCollection } from "@/lib/db/repositories/states";
import { stateResourceCapacityCollection } from "@/lib/db/repositories/stateResourceCapacity";

export interface NppCorpCountryPlan {
  countryId: CountryId;
  /** NPP corps to spawn per sector type (1 = player-enabled, 2 = econ-preview). */
  perSectorCount: number;
  /** HQ region for every corp in this country. */
  hqState: string;
}

/**
 * Presets that do NOT spawn NPP market corporations; every other preset does.
 *
 * Spawning corporations is an economy change, so leaving a preset out is a
 * decision that carries a reason here.
 */
export const NPP_CORP_SPAWN_EXCLUSIONS: PresetExclusions = {
  "2023-default": "no decision has been made to give this era NPP market corporations",
  empty: "variant of the 2019 world that has never spawned NPP corporations",
  "2019-no-parties": "variant of the 2019 world that has never spawned NPP corporations",
};

/**
 * Presets whose NPP-run countries do NOT open with one competitor per market;
 * every other preset gets one.
 */
export const NPP_RUN_COUNTRY_SPAWN_EXCLUSIONS: PresetExclusions = {
  "1953-default": "keeps the market it shipped with",
  "1979-default": "keeps the market it shipped with",
  "1991-default": "keeps the market it shipped with",
  "1999-default": "keeps the market it shipped with",
  "2007-default": "keeps the market it shipped with",
  "2019-default": "keeps the market it shipped with",
  "2023-default": "keeps the market it shipped with",
  empty: "variant of the 2019 world",
  "2019-no-parties": "variant of the 2019 world",
};

export const spawnsNppCorporations = (preset: string) =>
  !isExcludedPreset(NPP_CORP_SPAWN_EXCLUSIONS, preset);

export const spawnsRunCountryCompetitors = (preset: string) =>
  !isExcludedPreset(NPP_RUN_COUNTRY_SPAWN_EXCLUSIONS, preset);

/**
 * The per-country NPP market-corp spawn policy for a preset. Pure — no DB
 * access — so the seed step and the `spawn-npp-all` admin route share one
 * source of truth. Returns `[]` for presets that do not spawn NPP corps.
 */
export function nppCorpSpawnPlan(preset: string, startingYear: number): NppCorpCountryPlan[] {
  if (!spawnsNppCorporations(preset)) return [];
  const mapped = getPresetEnablementCountries(preset);
  if (!mapped) return [];

  // US runs off the global GameState and is excluded from the enablement map,
  // but it is always the flagship player-enabled country.
  const usId = COUNTRY_CONFIGS.US.id;
  // Background countries run no corporations.
  const countries: CountryId[] = [usId, ...mapped].filter(
    (countryId) => !isBackgroundInPreset(preset, countryId)
  );
  const plan: NppCorpCountryPlan[] = [];

  for (const countryId of countries) {
    let perSectorCount: number;
    if (countryId === usId) {
      perSectorCount = 1;
    } else {
      const tier = getPresetEnablementTier(preset, countryId);
      if (!tier) continue;
      perSectorCount = tier.enabledForPlayers
        ? 1
        : tier.economyPreview
          ? 2
          : spawnsRunCountryCompetitors(preset)
            ? 1
            : 0;
    }
    if (perSectorCount === 0) continue;

    // Market economies only — planned economies get their SOEs from the budget
    // seeders. The dial captures China migrating across eras (command in 1953,
    // market by 2019) without a per-preset country list.
    if (scheduledMarketizationLevel(countryId, startingYear) < DUAL_TRACK_CEILING) {
      continue;
    }

    const hqState = NPP_CAPITAL_STATES[countryId];
    if (!hqState) continue;

    plan.push({ countryId, perSectorCount, hqState });
  }

  return plan;
}

export interface SeedNppCorporationsResult {
  totalSpawned: number;
  byCountry: Record<string, number>;
}

/**
 * Fill missing NPP competitors per market without duplicating completed markets.
 */
export async function seedNppCorporations(
  db: Db,
  preset: string,
  startingYear: number,
  log: (msg: string) => void = () => {}
): Promise<SeedNppCorporationsResult> {
  const plan = nppCorpSpawnPlan(preset, startingYear);
  const byCountry: Record<string, number> = {};
  let totalSpawned = 0;

  // One market per operating lane, stored under its canonical identity.
  const sectorMarkets = OPERATING_SECTOR_TYPES.map((lane) => {
    const identity = operatingSectorIdentity(lane);
    return {
      type: identity.sectorType,
      industryModel: identity.industryModel,
      mediaDiscriminator: identity.mediaDiscriminator,
    };
  });

  for (const { countryId, perSectorCount } of plan) {
    const extractionSite =
      preset === "1991-default" && ["US", "UK", "JP"].includes(countryId)
        ? chooseSeedExtractionSite(
            await stateResourceCapacityCollection(db).find({ countryId }).toArray()
          )
        : null;
    const existing = await corporationsCollection(db)
      .find({ ceoType: "npp", countryId })
      .project<Pick<Corporation, "type" | "industryModel" | "mediaDiscriminator">>({
        type: 1,
        industryModel: 1,
        mediaDiscriminator: 1,
      })
      .toArray();
    // Fresh 1991 only: size the competitor book from the country's whole
    // economy rather than its capital region (see rules/nppSeedCapacity.ts).
    const countryStates =
      preset === "1991-default"
        ? await statesCollection(db)
            .find({ countryId, _id: { $not: /^NATIONAL_/ } })
            .project<Pick<State, "_id" | "gdp">>({ gdp: 1 })
            .toArray()
        : [];
    let countrySpawned = 0;
    for (const market of sectorMarkets) {
      const present = existing.filter(
        (corp) =>
          getOperatingSectorType(corp.type, corp.industryModel, corp.mediaDiscriminator) ===
          getOperatingSectorType(market.type, market.industryModel, market.mediaDiscriminator)
      ).length;
      const missing = Math.max(0, perSectorCount - present);
      if (missing === 0) continue;
      const operatingType = getOperatingSectorType(
        market.type,
        market.industryModel,
        market.mediaDiscriminator
      ) as OperatingSectorType;
      const countrySizedCap =
        countryStates.length > 0
          ? nppSeedRevenueCap({
              countryPoolRevenue: countryStates.reduce(
                (sum, region) =>
                  sum +
                  computeUnownedSeedRevenue({
                    gdp: region.gdp,
                    countryId,
                    stateId: String(region._id),
                    sectorType: operatingType,
                    preset,
                  }),
                0
              ),
              perSectorCount,
              floorRevenue:
                foundingStarterUnits(market.type, market.industryModel, market.mediaDiscriminator) *
                revenuePerCapacityUnit(
                  market.type,
                  getEraUnitScale(preset),
                  market.industryModel,
                  market.mediaDiscriminator
                ),
            })
          : undefined;
      const extractionCap =
        market.type === "extraction" && extractionSite
          ? (extractionSite.supportedDailyRevenue / getEraUnitScale(preset)) * 0.25
          : undefined;
      const maximumStartingRevenue =
        countrySizedCap !== undefined && extractionCap !== undefined
          ? Math.min(countrySizedCap, extractionCap)
          : (countrySizedCap ?? extractionCap);
      const spawned = await batchSpawnNppCorporations(db, countryId, {
        perSectorCount: missing,
        sectorMarkets: [market],
        // The strict opening headroom acceptance applies to the audited reset.
        // Older presets retain their authored competitor grants.
        limitToUnownedPool: preset === "1991-default",
        ...(market.type === "extraction" && extractionSite
          ? {
              headquartersState: extractionSite.stateId,
              initialStrategyId: extractionSite.strategyId,
            }
          : {}),
        ...(maximumStartingRevenue !== undefined ? { maximumStartingRevenue } : {}),
      });
      if (spawned.length !== missing) {
        throw new Error(
          `NPP seed incomplete: ${countryId}/${market.type}/${market.industryModel ?? "standard"} expected ${missing} competitors, created ${spawned.length}`
        );
      }
      countrySpawned += spawned.length;
    }
    byCountry[countryId] = countrySpawned;
    totalSpawned += countrySpawned;
    log(
      `[seedNppCorporations] ${countryId}: completed ${sectorMarkets.length} markets, spawned ${countrySpawned} competitors`
    );
  }

  log(
    `[seedNppCorporations] seeded ${totalSpawned} NPP corps across ${
      Object.keys(byCountry).length
    } countries`
  );
  return { totalSpawned, byCountry };
}
