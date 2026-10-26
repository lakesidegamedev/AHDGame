/**
 * Client-safe core of the country registry.
 *
 * countries.ts re-exports every name here, so server code keeps importing the
 * full registry unchanged. Client components that only need country ids,
 * ordering, address labels or government-type predicates import this module
 * instead, which keeps the per-country era, identity, seat and institution
 * data out of the shared browser bundle.
 *
 * Nothing in this file may import a module under src/lib/countries or read
 * COUNTRY_CONFIGS. Keep it to ids, small tables and pure lookups.
 */

export type CountryId =
  | "US"
  | "UK"
  | "DE"
  | "JP"
  | "IE"
  | "BR"
  | "CN"
  | "NG"
  | "HU"
  | "PL"
  | "RO"
  | "YU"
  | "BG"
  | "BLR"
  | "UKR"
  | "CS"
  | "BAL"
  | "RU"
  | "FR"
  | "IT"
  | "ES"
  | "SE"
  | "TR"
  | "GR"
  | "AT"
  | "FI"
  | "DD"
  | "SCO"
  | "WAL";

/**
 * Discrete government system enum driving executive and election mechanics.
 * Mirrors the inline union on CountryConfig.governmentType.
 */
export type GovernmentType =
  "presidential" | "parliamentaryMonarchy" | "parliamentaryRepublic" | "onePartyState";

export type CountryStatus = "active" | "beta" | "coming-soon";

/**
 * The canonical registered-country list. Latent secession countries (SCO/WAL)
 * are absent here until the secession actuation registers them.
 */
export const COUNTRY_ORDER: CountryId[] = [
  "US",
  "UK",
  "JP",
  "DE",
  "IE",
  "BR",
  "CN",
  "NG",
  "HU",
  "PL",
  "RO",
  "YU",
  "BG",
  "CS",
  "RU",
  "FR",
  "IT",
  "ES",
  "SE",
  "TR",
  "GR",
  "AT",
  "FI",
  "DD",
];

/**
 * Presidential countries that run their own bespoke presidential-election
 * engine (national popular vote + spread + run-off) rather than the US
 * electoral-college engine.
 */
export const COUNTRIES_WITH_BESPOKE_PRESIDENTIAL_ELECTIONS = new Set<CountryId>(["NG"]);

/**
 * Countries whose President is chosen by a live election cycle rather than by
 * appointment. Superset of the bespoke set above: the US president is elected
 * through the electoral-college engine.
 */
export const COUNTRIES_WITH_PRESIDENTIAL_ELECTION_CYCLES = new Set<CountryId>([
  "US",
  "BR",
  ...COUNTRIES_WITH_BESPOKE_PRESIDENTIAL_ELECTIONS,
]);

/**
 * Countries that hold all national and regional offices in one concurrent
 * general election on a single multi-year cycle (vs the US staggered calendar).
 */
export const COUNTRIES_WITH_CONCURRENT_GENERAL_ELECTIONS = new Set<CountryId>(["NG"]);

/** Narrow literal pair for the two originally shipped countries. */
export type UsUkCountryId = Extract<CountryId, "US" | "UK">;

export const US_UK_COUNTRY_IDS: readonly UsUkCountryId[] = ["US", "UK"];

/** Countries participating in the Eurozone currency union. */
export const EU_EUROZONE_MEMBERS: CountryId[] = ["DE", "IE"];

/**
 * Countries whose region `_id`s are country-prefixed (HU_BUD, FR_IDF, ...).
 * Legacy countries (US/UK/DE/JP/...) keep bare codes (AL, SCO, BW).
 */
const PREFIXED_REGION_ID_COUNTRIES: ReadonlySet<CountryId> = new Set<CountryId>([
  "FR",
  "IT",
  "ES",
  "SE",
  "TR",
  "GR",
  "AT",
  "FI",
  "HU",
  "PL",
  "RO",
  "YU",
  "BG",
  "CS",
  "BLR",
  "UKR",
  "BAL",
]);

/** The short, player-facing form of a region id ("HU_BUD" -> "BUD"). */
export function compactRegionCode(countryId: CountryId | string, regionId: string): string {
  const prefix = `${countryId}_`;
  return PREFIXED_REGION_ID_COUNTRIES.has(countryId as CountryId) && regionId.startsWith(prefix)
    ? regionId.slice(prefix.length)
    : regionId;
}

/** The canonical stored region id for a URL param ("BUD" -> "HU_BUD"). */
export function canonicalRegionId(countryId: CountryId | string, regionParam: string): string {
  const prefix = `${countryId}_`;
  return PREFIXED_REGION_ID_COUNTRIES.has(countryId as CountryId) && !regionParam.startsWith(prefix)
    ? `${prefix}${regionParam}`
    : regionParam;
}

/**
 * Number of candidates that advance from a party primary to the general
 * election, keyed by governmentType.
 */
export const PRIMARY_WINNERS_BY_GOVERNMENT_TYPE: Record<GovernmentType, number> = {
  presidential: 1,
  parliamentaryMonarchy: 3,
  parliamentaryRepublic: 3,
  onePartyState: 7,
};

/** Resolve the primary-winner cap from a government type directly. */
export function getPrimaryWinnersForGovernmentType(governmentType: GovernmentType): number {
  return PRIMARY_WINNERS_BY_GOVERNMENT_TYPE[governmentType];
}

/**
 * Election types that elect a single office-holder via a directly-contested
 * ballot, so exactly one candidate per party may advance from the primary
 * regardless of the country's government type.
 */
export const SINGLE_WINNER_EXECUTIVE_ELECTION_TYPES: ReadonlySet<string> = new Set([
  "president",
  "governor",
  "uachtaran",
  "ministerPresident",
]);

/**
 * Per-regime vote-weight multipliers for one-party-state legislative general
 * elections. `ruling` and `approved` together produce roughly an 80% ruling
 * seat share with a typical one-party primary output.
 */
export const DEFAULT_OPS_VOTE_MULTIPLIERS = {
  ruling: 3.0,
  approved: 0.375,
  independent: 0.0,
  banned: 0.0,
} as const;

export interface OpsVoteMultipliers {
  ruling: number;
  approved: number;
  independent: number;
  banned: number;
}

/** How the executive is chosen after an election, keyed by governmentType. */
export const EXECUTIVE_FORMATION_BY_GOVERNMENT_TYPE: Record<
  GovernmentType,
  "direct_election" | "confidence_of_legislature"
> = {
  presidential: "direct_election",
  parliamentaryMonarchy: "confidence_of_legislature",
  parliamentaryRepublic: "confidence_of_legislature",
  onePartyState: "confidence_of_legislature",
};

export type ExecutiveFormation = (typeof EXECUTIVE_FORMATION_BY_GOVERNMENT_TYPE)[GovernmentType];

/** Resolve the executive-formation mode from a government type directly. */
export function getExecutiveFormationForGovernmentType(
  governmentType: GovernmentType
): ExecutiveFormation {
  return EXECUTIVE_FORMATION_BY_GOVERNMENT_TYPE[governmentType];
}

/**
 * True when the country's executive is directly elected by voters (presidential
 * systems). Convenience inverse of isParliamentarySystem for code that cares
 * about election mechanics rather than regime type.
 */
export function isDirectElection(
  config: { governmentType: GovernmentType } | null | undefined
): boolean {
  return config?.governmentType === "presidential";
}

/** Pure-field variant for callers that have pre-resolved governmentType. */
export function isPresidentialGovernmentType(
  governmentType: GovernmentType | null | undefined
): boolean {
  return governmentType === "presidential";
}

/** Whether the executive can make acting (unconfirmed) cabinet appointments. */
export const SUPPORTS_ACTING_APPOINTMENTS_BY_GOVERNMENT_TYPE: Record<GovernmentType, boolean> = {
  presidential: true,
  parliamentaryMonarchy: false,
  parliamentaryRepublic: false,
  onePartyState: false,
};

export function supportsActingAppointments(
  config: { governmentType: GovernmentType } | null | undefined
): boolean {
  if (!config) return false;
  return SUPPORTS_ACTING_APPOINTMENTS_BY_GOVERNMENT_TYPE[config.governmentType];
}

export function supportsActingAppointmentsForGovernmentType(
  governmentType: GovernmentType | null | undefined
): boolean {
  if (!governmentType) return false;
  return SUPPORTS_ACTING_APPOINTMENTS_BY_GOVERNMENT_TYPE[governmentType];
}

/** How country-level approval is derived each turn, keyed by governmentType. */
export const APPROVAL_SOURCE_BY_GOVERNMENT_TYPE: Record<
  GovernmentType,
  "president_favorability" | "pm_favorability"
> = {
  presidential: "president_favorability",
  parliamentaryMonarchy: "pm_favorability",
  parliamentaryRepublic: "pm_favorability",
  onePartyState: "pm_favorability",
};

export type ApprovalSource = (typeof APPROVAL_SOURCE_BY_GOVERNMENT_TYPE)[GovernmentType];

export function getApprovalSourceForGovernmentType(governmentType: GovernmentType): ApprovalSource {
  return APPROVAL_SOURCE_BY_GOVERNMENT_TYPE[governmentType];
}

/**
 * Default for CountryConfig.confidenceVoteMechanism when the country does not
 * set it explicitly, keyed by governmentType.
 */
export const CONFIDENCE_VOTE_MECHANISM_DEFAULTS_BY_GOVERNMENT_TYPE: Record<
  GovernmentType,
  boolean
> = {
  presidential: false,
  parliamentaryMonarchy: true,
  parliamentaryRepublic: true,
  onePartyState: false,
};

export function hasConfidenceVoteMechanism(
  config: { governmentType: GovernmentType; confidenceVoteMechanism?: boolean } | null | undefined
): boolean {
  if (!config) return false;
  if (typeof config.confidenceVoteMechanism === "boolean") {
    return config.confidenceVoteMechanism;
  }
  return CONFIDENCE_VOTE_MECHANISM_DEFAULTS_BY_GOVERNMENT_TYPE[config.governmentType];
}

export function hasConfidenceVoteMechanismForGovernmentType(
  governmentType: GovernmentType | null | undefined,
  override: boolean | undefined
): boolean {
  if (!governmentType) return false;
  if (typeof override === "boolean") return override;
  return CONFIDENCE_VOTE_MECHANISM_DEFAULTS_BY_GOVERNMENT_TYPE[governmentType];
}

/**
 * Default for CountryConfig.snapElectionsAllowed when the country does not set
 * it explicitly, keyed by governmentType.
 */
export const SNAP_ELECTIONS_ALLOWED_DEFAULTS_BY_GOVERNMENT_TYPE: Record<GovernmentType, boolean> = {
  presidential: false,
  parliamentaryMonarchy: true,
  parliamentaryRepublic: true,
  onePartyState: false,
};

export function supportsSnapElections(
  config: { governmentType: GovernmentType; snapElectionsAllowed?: boolean } | null | undefined
): boolean {
  if (!config) return false;
  if (typeof config.snapElectionsAllowed === "boolean") {
    return config.snapElectionsAllowed;
  }
  return SNAP_ELECTIONS_ALLOWED_DEFAULTS_BY_GOVERNMENT_TYPE[config.governmentType];
}

export function supportsSnapElectionsForGovernmentType(
  governmentType: GovernmentType | null | undefined,
  override: boolean | undefined
): boolean {
  if (!governmentType) return false;
  if (typeof override === "boolean") return override;
  return SNAP_ELECTIONS_ALLOWED_DEFAULTS_BY_GOVERNMENT_TYPE[governmentType];
}

/**
 * Chamber keys whose seated members are eligible for direct cabinet
 * appointment, resolved against the country's governmentType and legislature.
 */
export function getCabinetEligibleChamberKeys(
  config:
    | {
        governmentType: GovernmentType;
        cabinetEligibleChamberKeys?: string[];
        legislature: { lowerChamber: { key: string } };
      }
    | null
    | undefined
): string[] {
  if (!config) return [];
  if (config.cabinetEligibleChamberKeys) return config.cabinetEligibleChamberKeys;
  if (!isParliamentarySystem(config)) return [];
  return [config.legislature.lowerChamber.key];
}

/**
 * Default for CountryConfig.hasImperialRole when the country does not set it
 * explicitly, keyed by governmentType.
 */
export const HAS_IMPERIAL_ROLE_DEFAULTS_BY_GOVERNMENT_TYPE: Record<GovernmentType, boolean> = {
  presidential: false,
  parliamentaryMonarchy: true,
  parliamentaryRepublic: false,
  onePartyState: false,
};

export function isImperialCountry(
  config: { governmentType: GovernmentType; hasImperialRole?: boolean } | null | undefined
): boolean {
  if (!config) return false;
  if (typeof config.hasImperialRole === "boolean") {
    return config.hasImperialRole;
  }
  return HAS_IMPERIAL_ROLE_DEFAULTS_BY_GOVERNMENT_TYPE[config.governmentType];
}

export function isImperialForGovernmentType(
  governmentType: GovernmentType | null | undefined,
  override: boolean | undefined
): boolean {
  if (!governmentType) return false;
  if (typeof override === "boolean") return override;
  return HAS_IMPERIAL_ROLE_DEFAULTS_BY_GOVERNMENT_TYPE[governmentType];
}

/**
 * Default for CountryConfig.headOfStateTitle when the country does not set it
 * explicitly, keyed by governmentType.
 */
export const HEAD_OF_STATE_TITLE_DEFAULTS_BY_GOVERNMENT_TYPE: Record<GovernmentType, string> = {
  presidential: "President",
  parliamentaryMonarchy: "Monarch",
  parliamentaryRepublic: "President",
  onePartyState: "President",
};

/** Resolve the head-of-state title for a country. */
export function getHeadOfStateTitle(
  config: { governmentType: GovernmentType; headOfStateTitle?: string } | null | undefined
): string {
  if (!config) return "President";
  if (config.headOfStateTitle) return config.headOfStateTitle;
  return HEAD_OF_STATE_TITLE_DEFAULTS_BY_GOVERNMENT_TYPE[config.governmentType];
}

/**
 * Office-type key of a country's ceremonial head of state (the office marked
 * isHeadOfState), or null when none exists.
 */
export function getHeadOfStateOfficeType(
  config:
    { officeTypes: ReadonlyArray<{ key: string; isHeadOfState?: boolean }> } | null | undefined
): string | null {
  return config?.officeTypes.find((o) => o.isHeadOfState)?.key ?? null;
}

/** Pure-field variant for callers that have pre-resolved governmentType. */
export function getHeadOfStateTitleForGovernmentType(
  governmentType: GovernmentType | null | undefined,
  override: string | undefined
): string {
  if (!governmentType) return "President";
  if (override) return override;
  return HEAD_OF_STATE_TITLE_DEFAULTS_BY_GOVERNMENT_TYPE[governmentType];
}

const COUNTRY_LOCALE_OVERRIDES: Partial<Record<CountryId, "en-GB">> = {
  UK: "en-GB",
};

/** Locale code for user-facing text rendered for the given country. */
export function getCountryLocale(countryId: CountryId): "en-US" | "en-GB" {
  return COUNTRY_LOCALE_OVERRIDES[countryId] ?? "en-US";
}

/**
 * True when the country runs on the parliamentary code path: executive emerges
 * from legislative confidence rather than a direct election.
 */
export function isParliamentarySystem(
  config: { governmentType: GovernmentType } | null | undefined
): boolean {
  return isParliamentarySystemForGovernmentType(config?.governmentType);
}

export function isParliamentarySystemForGovernmentType(
  governmentType: GovernmentType | null | undefined
): boolean {
  return (
    governmentType === "parliamentaryMonarchy" ||
    governmentType === "parliamentaryRepublic" ||
    governmentType === "onePartyState"
  );
}

const REGIONAL_ADDRESS_NAME: Partial<Record<CountryId, string>> = {
  DE: "Government Statement",
};

/**
 * User-facing name of the regional "State of the State" analogue. Defaults to
 * "State of the State" when no country-specific override exists.
 */
export function getRegionalAddressName(countryId: CountryId): string {
  return REGIONAL_ADDRESS_NAME[countryId] ?? "State of the State";
}

/** User-facing name for the head-of-government order at the national scope. */
export function getExecutiveOrderNameForGovernmentType(
  governmentType: GovernmentType | null | undefined
): string {
  return governmentType === "presidential" ? "Executive Order" : "Order in Council";
}

/** Plural form for headers ("Executive Orders" vs "Orders in Council"). */
export function getExecutiveOrderNamePluralForGovernmentType(
  governmentType: GovernmentType | null | undefined
): string {
  return governmentType === "presidential" ? "Executive Orders" : "Orders in Council";
}
