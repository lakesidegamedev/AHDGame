import { MongoServerError } from "mongodb";
import type { CorporateSector, State } from "@/lib/db/types";
import type { CountryId } from "@/lib/constants/countries";

export function buildSectorStateCountryMap(
  states: Pick<State, "_id" | "countryId">[]
): Map<string, CountryId> {
  return new Map(states.map((state) => [String(state._id), state.countryId]));
}

export function getSectorOperatingCountryId(
  sector: Pick<CorporateSector, "stateId" | "countryId">,
  stateCountryByStateId: ReadonlyMap<string, CountryId>
): CountryId {
  return stateCountryByStateId.get(sector.stateId) ?? sector.countryId;
}

export function getCorporateSectorLocationKey(
  sector: Pick<
    CorporateSector,
    "corporationId" | "stateId" | "sectorType" | "countryId" | "nationalizationSiteKey"
  >,
  stateCountryByStateId: ReadonlyMap<string, CountryId>
): string {
  return [
    sector.corporationId.toString(),
    getSectorOperatingCountryId(sector, stateCountryByStateId),
    sector.stateId,
    sector.sectorType,
    sector.nationalizationSiteKey ?? "",
  ].join(":");
}

export const STRATEGY_BUILD_SITE_PREFIX = "strategy-build:";

export function isStrategyBuildSite(sector: Pick<CorporateSector, "nationalizationSiteKey">) {
  return sector.nationalizationSiteKey?.startsWith(STRATEGY_BUILD_SITE_PREFIX) === true;
}

export function isCorporateSectorDuplicateKey(error: unknown): error is MongoServerError {
  return (
    error instanceof MongoServerError &&
    error.code === 11000 &&
    (!!error.keyPattern?.corporationId ||
      /\bcorporationId_1_stateId_1_sectorType_1\b/.test(error.message) ||
      /\bcorporateSectors_corporation_state_type_unique\b/.test(error.message))
  );
}
