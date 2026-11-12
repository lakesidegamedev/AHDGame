/**
 * UK Commons seat counts by region (Westminster constituencies per NUTS1 region).
 * Matches ukRegions.houseDistricts. Sum = 652 (ONS 2023 boundary review).
 * Mirrors HOUSE_SEATS for the UK parliamentary system.
 */
export const UK_COMMONS_SEATS: Record<string, number> = {
  LON: 75,
  SEE: 90,
  SWE: 58,
  EAE: 60,
  EMI: 47,
  WMI: 57,
  YHU: 54,
  NWE: 75,
  NEE: 27,
  SCO: 57,
  WAL: 32,
  NIR: 18,
};

export const TOTAL_UK_COMMONS_SEATS = 650;

/**
 * UK Commons seat counts by region, 1950-1955 redistribution (in force for
 * the `1953-default` preset). Mirrors `ukRegions1953.houseDistricts` exactly
 * (England 506 / Scotland 71 / Wales 36 / Northern Ireland 12 = 625).
 */
export const UK_COMMONS_SEATS_1953: Record<string, number> = {
  LON: 91,
  SEE: 81,
  SWE: 43,
  EAE: 47,
  EMI: 37,
  WMI: 53,
  YHU: 52,
  NWE: 75,
  NEE: 27,
  SCO: 71,
  WAL: 36,
  NIR: 12,
};

export const TOTAL_UK_COMMONS_SEATS_1953 = 625;

/**
 * UK Commons seat counts by region, 1983 redistribution (in force for the
 * `1991-default` preset). Mirrors `ukRegions1991.houseDistricts` exactly
 * (England 523 / Scotland 72 / Wales 38 / Northern Ireland 17 = 650).
 */
export const UK_COMMONS_SEATS_1991: Record<string, number> = {
  LON: 81,
  SEE: 89,
  SWE: 50,
  EAE: 53,
  EMI: 41,
  WMI: 56,
  YHU: 52,
  NWE: 72,
  NEE: 29,
  SCO: 72,
  WAL: 38,
  NIR: 17,
};

export const TOTAL_UK_COMMONS_SEATS_1991 = 650;

/** UK region id → display name. Matches ukRegions seed names. */
export const UK_REGION_NAMES: Record<string, string> = {
  LON: "London",
  SEE: "South East England",
  SWE: "South West England",
  EAE: "East of England",
  EMI: "East Midlands",
  WMI: "West Midlands",
  YHU: "Yorkshire & the Humber",
  NWE: "North West England",
  NEE: "North East England",
  SCO: "Scotland",
  WAL: "Wales",
  NIR: "Northern Ireland",
};

/**
 * UK Regional Council seat counts by region.
 * Each council retains a five-year term, with regions split across five
 * annual cohorts. See elections/ukRegionalCouncilStagger.ts.
 */
export const UK_REGIONAL_COUNCIL_SEATS: Record<string, number> = {
  LON: 32,
  SEE: 67,
  SWE: 39,
  EAE: 39,
  EMI: 39,
  WMI: 18,
  YHU: 21,
  NWE: 27,
  NEE: 17,
  SCO: 129,
  WAL: 60,
  NIR: 90,
};
