/**
 * Seed values for the runtime-mutable country config.
 *
 * `useRuntimeCountryConfig` renders a seed-derived fallback while its fetch is
 * in flight, and that fallback needs four fields. Reading them from
 * `countryClientConfig.ts` shipped the whole client registry to every page that
 * mounts the hook. This is the sliver it needs, and `countryRuntimeSeed.test.ts`
 * pins it to the registry.
 */
import type { CountryId, GovernmentType } from "@/lib/constants/countriesCore";

export interface CountryRuntimeSeed {
  governmentType: GovernmentType;
  rulingPartyId: number | null;
  hasLeaderConfidenceModel: boolean;
}

export const COUNTRY_RUNTIME_SEED: Record<CountryId, CountryRuntimeSeed> = {
  US: { governmentType: "presidential", rulingPartyId: null, hasLeaderConfidenceModel: false },
  UK: {
    governmentType: "parliamentaryMonarchy",
    rulingPartyId: null,
    hasLeaderConfidenceModel: false,
  },
  DE: {
    governmentType: "parliamentaryRepublic",
    rulingPartyId: null,
    hasLeaderConfidenceModel: false,
  },
  JP: {
    governmentType: "parliamentaryMonarchy",
    rulingPartyId: null,
    hasLeaderConfidenceModel: false,
  },
  IE: {
    governmentType: "parliamentaryRepublic",
    rulingPartyId: null,
    hasLeaderConfidenceModel: false,
  },
  SCO: {
    governmentType: "parliamentaryRepublic",
    rulingPartyId: null,
    hasLeaderConfidenceModel: false,
  },
  WAL: {
    governmentType: "parliamentaryRepublic",
    rulingPartyId: null,
    hasLeaderConfidenceModel: false,
  },
  BR: { governmentType: "presidential", rulingPartyId: null, hasLeaderConfidenceModel: false },
  CN: { governmentType: "onePartyState", rulingPartyId: 1, hasLeaderConfidenceModel: true },
  NG: { governmentType: "presidential", rulingPartyId: null, hasLeaderConfidenceModel: false },
  HU: { governmentType: "onePartyState", rulingPartyId: 1, hasLeaderConfidenceModel: false },
  PL: { governmentType: "onePartyState", rulingPartyId: 1, hasLeaderConfidenceModel: false },
  RO: { governmentType: "onePartyState", rulingPartyId: 1, hasLeaderConfidenceModel: false },
  YU: { governmentType: "onePartyState", rulingPartyId: 1, hasLeaderConfidenceModel: false },
  BG: { governmentType: "onePartyState", rulingPartyId: 1, hasLeaderConfidenceModel: false },
  BLR: { governmentType: "onePartyState", rulingPartyId: 1, hasLeaderConfidenceModel: false },
  CS: { governmentType: "onePartyState", rulingPartyId: 1, hasLeaderConfidenceModel: false },
  UKR: { governmentType: "onePartyState", rulingPartyId: 1, hasLeaderConfidenceModel: false },
  BAL: { governmentType: "onePartyState", rulingPartyId: null, hasLeaderConfidenceModel: false },
  RU: { governmentType: "onePartyState", rulingPartyId: 1, hasLeaderConfidenceModel: true },
  FR: { governmentType: "presidential", rulingPartyId: null, hasLeaderConfidenceModel: false },
  IT: {
    governmentType: "parliamentaryRepublic",
    rulingPartyId: null,
    hasLeaderConfidenceModel: false,
  },
  ES: {
    governmentType: "parliamentaryMonarchy",
    rulingPartyId: null,
    hasLeaderConfidenceModel: false,
  },
  SE: {
    governmentType: "parliamentaryMonarchy",
    rulingPartyId: null,
    hasLeaderConfidenceModel: false,
  },
  TR: {
    governmentType: "parliamentaryRepublic",
    rulingPartyId: null,
    hasLeaderConfidenceModel: false,
  },
  GR: {
    governmentType: "parliamentaryRepublic",
    rulingPartyId: null,
    hasLeaderConfidenceModel: false,
  },
  AT: {
    governmentType: "parliamentaryRepublic",
    rulingPartyId: null,
    hasLeaderConfidenceModel: false,
  },
  FI: {
    governmentType: "parliamentaryRepublic",
    rulingPartyId: null,
    hasLeaderConfidenceModel: false,
  },
  DD: { governmentType: "onePartyState", rulingPartyId: 1, hasLeaderConfidenceModel: true },
};
