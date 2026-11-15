/**
 * Landing-globe tier rosters, materialised from the world entity manifest
 * (`getWorldEntityMapSnapshot(presetId)`).
 *
 *   - Economic Powers    = `simulationTier: "full-autonomous"` and not a player
 *                          nation (`legacyAccess !== "player"`).
 *   - Battleground Nations = `simulationTier: "sphere-macro"`.
 *
 * Ids are Natural Earth ISO 3166-1 numeric feature ids, matching the globe
 * topojson, so no second lookup is needed at render time.
 *
 * Copied rather than imported because the landing globe is a client component;
 * importing the manifest would pull ~1,800 lines into the marketing bundle.
 * `countryTiers.test.ts` re-derives both tables and fails on drift.
 */

/** Full-autonomy NPP economies players can run and split sectors in. */
export const ECONOMIC_POWER_FEATURE_IDS_BY_PRESET: Readonly<Record<string, readonly string[]>> = {
  "1953-default": [
    "040", // AT
    "076", // BR
    "100", // BG
    "112", // BLR
    "156", // CN
    "233", // BAL (Estonia)
    "246", // FI
    "250", // FR
    "276", // DE
    "300", // GR
    "348", // HU
    "372", // IE
    "380", // IT
    "392", // JP
    "428", // BAL (Latvia)
    "440", // BAL (Lithuania)
    "566", // NG
    "616", // PL
    "642", // RO
    "752", // SE
    "792", // TR
    "804", // UKR
  ],
  "1979-default": [
    "040", // AT
    "076", // BR
    "156", // CN
    "246", // FI
    "250", // FR
    "276", // DE
    "300", // GR
    "372", // IE
    "380", // IT
    "392", // JP
    "566", // NG
    "724", // ES
    "752", // SE
    "792", // TR
  ],
  "1991-default": [
    "040", // AT
    "076", // BR
    "100", // BG
    "156", // CN
    "246", // FI
    "250", // FR
    "276", // DE
    "300", // GR
    "348", // HU
    "372", // IE
    "380", // IT
    "566", // NG
    "616", // PL
    "642", // RO
    "643", // RU
    "724", // ES
    "752", // SE
    "792", // TR
  ],
  "1999-default": [
    "040", // AT
    "076", // BR
    "156", // CN
    "246", // FI
    "250", // FR
    "276", // DE
    "300", // GR
    "372", // IE
    "380", // IT
    "566", // NG
    "724", // ES
    "752", // SE
    "792", // TR
  ],
  "2007-default": [
    "040", // AT
    "076", // BR
    "156", // CN
    "246", // FI
    "250", // FR
    "276", // DE
    "300", // GR
    "372", // IE
    "380", // IT
    "566", // NG
    "724", // ES
    "752", // SE
    "792", // TR
  ],
  // US/UK/JP left this roster when the era roster made them player countries in
  // every modern preset: this list is full-autonomous entities that are NOT
  // player-run, and they now are.
  "2023-default": [
    "156", // CN
    "276", // DE
    "372", // IE
  ],
  // UK, DE, JP and CN are NPP-run full simulations in 2027. The 16 background countries, Ireland included, are background-macro economies in the manifest, not economic powers. Re-derived from the manifest by countryTiers.test.ts.
  "2027-default": [
    "156", // CN
    "276", // DE
    "392", // JP
    "826", // UK
  ],
  "2019-default": [
    "156", // CN
    "276", // DE
    "372", // IE
  ],
};

/** Sphere / conflict / crisis theatres (Korea, Iran, Egypt, Guatemala…). */
export const BATTLEGROUND_FEATURE_IDS_BY_PRESET: Readonly<Record<string, readonly string[]>> = {
  "1953-default": [
    "004", // AF
    "012", // DZ
    "024", // AO
    "032", // AR
    "104", // MM
    "116", // KH
    "152", // CL
    "192", // CU
    "231", // ET
    "288", // GH
    "320", // GT
    "328", // GY
    "356", // IN
    "360", // ID
    "364", // IR
    "368", // IQ
    "400", // JO
    "408", // KP
    "410", // KR
    "418", // LA
    "484", // MX
    "508", // MZ
    "558", // NI
    "586", // PK
    "591", // PA
    "682", // SA
    "710", // ZA
    "724", // ES
    "760", // SY
    "764", // TH
    "818", // EG
    "862", // VE
    "887", // YE
    // Decolonisation theatres that gained geometry with the historical-territory
    // shard. Congo and Somalia take their modern feature; South Yemen has none, so
    // `historical-regions.json` supplies it under its entity key.
    "180", // CD
    "706", // SO
    "YD",
    // Entity keys, not ISO numerics: unified Vietnam's 704 covers both halves,
    // so `vietnam-regions.json` supplies one static feature each.
    "NVN",
    "SVN",
  ],
  "1979-default": [],
  "1991-default": [],
  "1999-default": [],
  "2007-default": [],
  "2019-default": [],
  "2023-default": [],
  "2027-default": [],
};

/** Economic-Power feature ids for a landing era id (e.g. "1953"). */
export function economicPowerFeatureIdsForEra(eraId: string): readonly string[] {
  return ECONOMIC_POWER_FEATURE_IDS_BY_PRESET[`${eraId}-default`] ?? [];
}

/** Battleground feature ids for a landing era id (e.g. "1953"). */
export function battlegroundFeatureIdsForEra(eraId: string): readonly string[] {
  return BATTLEGROUND_FEATURE_IDS_BY_PRESET[`${eraId}-default`] ?? [];
}
