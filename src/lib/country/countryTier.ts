import type { Db } from "mongodb";
import type { CountryId } from "@/lib/constants/countries";
import type { CountryGameState } from "@/lib/db/types/gameState";
import { registeredIdsFrom } from "@/lib/country/registeredCountries";
import {
  isFullSimulationTier,
  resolveCountryTier,
  type CountryTier,
  type CountryTierRow,
} from "@/lib/country/rules/countryTier";
import { countryGameStatesCollection } from "@/lib/db/repositories/countryGameStates";

export type { CountryTier } from "@/lib/country/rules/countryTier";

/**
 * Single source of truth for every country's tier. Per-country phases use
 * this to decide whether to run. A background country stays registered
 * (pages, currency, exchange rate) but is excluded from `fullSimulationIds`,
 * which is what phases iterate.
 */
export interface CountryTierSnapshot {
  tierOf(countryId: string): CountryTier;
  /** Registered countries, in registry order. */
  registeredIds: CountryId[];
  /** Player + NPP countries, in registry order: what per-country phases iterate. */
  fullSimulationIds: CountryId[];
  /** Registered countries outside the full simulation, in registry order. */
  backgroundIds: CountryId[];
}

export function buildCountryTierSnapshot(docs: CountryGameState[]): CountryTierSnapshot {
  const registeredIds = registeredIdsFrom(docs);
  const registered = new Set<string>(registeredIds);
  const rows = new Map<string, CountryTierRow>(docs.map((d) => [String(d._id), d]));
  const tierOf = (countryId: string): CountryTier =>
    resolveCountryTier(countryId, registered.has(countryId), rows.get(countryId));
  return {
    tierOf,
    registeredIds,
    fullSimulationIds: registeredIds.filter((id) => isFullSimulationTier(tierOf(id))),
    backgroundIds: registeredIds.filter((id) => tierOf(id) === "background"),
  };
}

/**
 * Load the snapshot in one round trip. Reads every row (one small row per
 * country): whether a row exists at all is part of the registry's answer.
 */
export async function loadCountryTiers(db: Db): Promise<CountryTierSnapshot> {
  const docs = await countryGameStatesCollection(db)
    .find(
      {},
      {
        projection: {
          _id: 1,
          status: 1,
          dissolvedTurn: 1,
          absentInEra: 1,
          backgroundCountry: 1,
          enabledForPlayers: 1,
        },
      }
    )
    .toArray();
  return buildCountryTierSnapshot(docs);
}

export async function getCountryTier(db: Db, countryId: string): Promise<CountryTier> {
  return (await loadCountryTiers(db)).tierOf(countryId);
}

/** Player + NPP countries: the list every per-country turn phase iterates. */
export async function getFullSimulationCountryIds(db: Db): Promise<CountryId[]> {
  return (await loadCountryTiers(db)).fullSimulationIds;
}
