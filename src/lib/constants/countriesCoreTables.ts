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
  | "WAL"
  | "CA";

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
export const PREFIXED_REGION_ID_COUNTRIES: ReadonlySet<CountryId> = new Set<CountryId>([
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

/** Vote-to-seat/office allocation method for one political position.
 *  See docs/superpowers/specs/2026-06-27-election-systems-field-design.md. */
export type ElectionMethod =
  | "fptp" // single-seat plurality
  | "pr_hareQuota" // multi-seat Largest Remainder (Hare quota)
  | "pr_dhondt" // national highest-averages party allocation
  | "sntv" // candidate plurality in a multi-member constituency; at most one seat each
  | "pr_sainteLague" // odd-divisor proportional (DE Landtag)
  | "ams" // additional-member system (DE Bundestag)
  | "electoralCollege" // per-unit FPTP aggregated to a majority (US President)
  | "parliamentary" // head of gov via coalition/confidence vote (no popular ballot)
  | "ceremonial"; // head of state not contested in-system (monarch / appointed)

/** Political positions whose election method a country can configure. */
export type ElectionPosition =
  | "lowerChamber"
  | "upperChamber"
  | "subNationalChamber"
  | "subNationalExecutive"
  | "headOfGovernment"
  | "headOfState";

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

/** Whether the executive can make acting (unconfirmed) cabinet appointments. */
export const SUPPORTS_ACTING_APPOINTMENTS_BY_GOVERNMENT_TYPE: Record<GovernmentType, boolean> = {
  presidential: true,
  parliamentaryMonarchy: false,
  parliamentaryRepublic: false,
  onePartyState: false,
};

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

export const COUNTRY_LOCALE_OVERRIDES: Partial<Record<CountryId, "en-GB">> = {
  UK: "en-GB",
};

export const REGIONAL_ADDRESS_NAME: Partial<Record<CountryId, string>> = {
  DE: "Government Statement",
};
