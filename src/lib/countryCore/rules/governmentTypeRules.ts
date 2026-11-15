/** Client-safe government-type predicates and titles over the tables in constants/countriesCoreTables. Must not import src/lib/countries. */
import {
  type CountryId,
  type GovernmentType,
  PREFIXED_REGION_ID_COUNTRIES,
  PRIMARY_WINNERS_BY_GOVERNMENT_TYPE,
  EXECUTIVE_FORMATION_BY_GOVERNMENT_TYPE,
  type ExecutiveFormation,
  SUPPORTS_ACTING_APPOINTMENTS_BY_GOVERNMENT_TYPE,
  APPROVAL_SOURCE_BY_GOVERNMENT_TYPE,
  type ApprovalSource,
  CONFIDENCE_VOTE_MECHANISM_DEFAULTS_BY_GOVERNMENT_TYPE,
  SNAP_ELECTIONS_ALLOWED_DEFAULTS_BY_GOVERNMENT_TYPE,
  HAS_IMPERIAL_ROLE_DEFAULTS_BY_GOVERNMENT_TYPE,
  HEAD_OF_STATE_TITLE_DEFAULTS_BY_GOVERNMENT_TYPE,
  COUNTRY_LOCALE_OVERRIDES,
  REGIONAL_ADDRESS_NAME,
} from "@/lib/constants/countriesCoreTables";

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

/** Resolve the primary-winner cap from a government type directly. */
export function getPrimaryWinnersForGovernmentType(governmentType: GovernmentType): number {
  return PRIMARY_WINNERS_BY_GOVERNMENT_TYPE[governmentType];
}

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

export function getApprovalSourceForGovernmentType(governmentType: GovernmentType): ApprovalSource {
  return APPROVAL_SOURCE_BY_GOVERNMENT_TYPE[governmentType];
}

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
