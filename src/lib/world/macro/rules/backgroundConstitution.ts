/**
 * Constitutional facts for background countries: chamber size, seat method,
 * legal threshold, term, next regular election after January 2027, and head of
 * government title. The only per-country political inputs for background
 * election simulation.
 *
 * Seat methods:
 * - `pr_hareQuota`: largest remainder (Hare quota).
 * - `pr_dhondt`: D'Hondt highest averages.
 * - `pr_sainteLague`: Sainte-Lague odd divisors.
 * - `fptp`: single-member districts, modelled nationally as a winner's bonus.
 * - `mixed`: half the chamber by the district bonus, half proportional.
 */

/** The only preset with background countries that carry a national state. */
export const BACKGROUND_NATION_PRESET = "2027-default";

export type BackgroundSeatMethod =
  "pr_hareQuota" | "pr_dhondt" | "pr_sainteLague" | "fptp" | "mixed";

export interface BackgroundConstitution {
  chamberName: string;
  seats: number;
  method: BackgroundSeatMethod;
  /** National vote share a party needs for proportional seats (0 = none). */
  threshold: number;
  /** Years between regular elections. */
  termYears: number;
  /** Year of the first regular election after the 2027 start. */
  nextElectionYear: number;
  headTitle: string;
  /** Unemployment (percent) at which the economy reads as normal to voters. */
  naturalUnemployment: number;
  /** Primary balance (share of GDP) the opening budget runs. Negative = deficit. */
  initialPrimaryBalance: number;
  /** Country whose name pool leaders are drawn from, when not the country itself. */
  namePoolCountry?: string;
}

export const BACKGROUND_CONSTITUTIONS: Readonly<Record<string, BackgroundConstitution>> = {
  IE: {
    chamberName: "Dail Eireann",
    seats: 174,
    method: "pr_hareQuota",
    threshold: 0.02,
    termYears: 5,
    nextElectionYear: 2029,
    headTitle: "Taoiseach",
    naturalUnemployment: 4.5,
    initialPrimaryBalance: 0.01,
  },
  BR: {
    chamberName: "Chamber of Deputies",
    seats: 513,
    method: "pr_dhondt",
    threshold: 0.02,
    termYears: 4,
    nextElectionYear: 2030,
    headTitle: "President",
    naturalUnemployment: 8,
    initialPrimaryBalance: -0.005,
  },
  NG: {
    chamberName: "House of Representatives",
    seats: 360,
    method: "fptp",
    threshold: 0,
    termYears: 4,
    nextElectionYear: 2027,
    headTitle: "President",
    naturalUnemployment: 10,
    initialPrimaryBalance: -0.02,
  },
  RU: {
    chamberName: "State Duma",
    seats: 450,
    method: "mixed",
    threshold: 0.05,
    termYears: 5,
    nextElectionYear: 2031,
    headTitle: "President",
    naturalUnemployment: 4,
    initialPrimaryBalance: -0.01,
  },
  PL: {
    chamberName: "Sejm",
    seats: 460,
    method: "pr_dhondt",
    threshold: 0.05,
    termYears: 4,
    nextElectionYear: 2027,
    headTitle: "Prime Minister",
    naturalUnemployment: 4,
    initialPrimaryBalance: -0.035,
  },
  HU: {
    chamberName: "National Assembly",
    seats: 199,
    method: "mixed",
    threshold: 0.05,
    termYears: 4,
    nextElectionYear: 2030,
    headTitle: "Prime Minister",
    naturalUnemployment: 4.5,
    initialPrimaryBalance: -0.02,
  },
  RO: {
    chamberName: "Chamber of Deputies",
    seats: 330,
    method: "pr_dhondt",
    threshold: 0.05,
    termYears: 4,
    nextElectionYear: 2028,
    headTitle: "Prime Minister",
    naturalUnemployment: 5.5,
    initialPrimaryBalance: -0.045,
  },
  BG: {
    chamberName: "National Assembly",
    seats: 240,
    method: "pr_hareQuota",
    threshold: 0.04,
    termYears: 4,
    nextElectionYear: 2028,
    headTitle: "Prime Minister",
    naturalUnemployment: 4.5,
    initialPrimaryBalance: -0.02,
  },
  FR: {
    chamberName: "National Assembly",
    seats: 577,
    method: "fptp",
    threshold: 0,
    termYears: 5,
    nextElectionYear: 2029,
    headTitle: "Prime Minister",
    naturalUnemployment: 7.5,
    initialPrimaryBalance: -0.03,
  },
  IT: {
    chamberName: "Chamber of Deputies",
    seats: 400,
    method: "mixed",
    threshold: 0.03,
    termYears: 5,
    nextElectionYear: 2027,
    headTitle: "Prime Minister",
    naturalUnemployment: 7.5,
    initialPrimaryBalance: 0.005,
  },
  ES: {
    chamberName: "Congress of Deputies",
    seats: 350,
    method: "pr_dhondt",
    threshold: 0.03,
    termYears: 4,
    nextElectionYear: 2027,
    headTitle: "Prime Minister",
    naturalUnemployment: 11,
    initialPrimaryBalance: -0.01,
  },
  SE: {
    chamberName: "Riksdag",
    seats: 349,
    method: "pr_sainteLague",
    threshold: 0.04,
    termYears: 4,
    nextElectionYear: 2030,
    headTitle: "Prime Minister",
    naturalUnemployment: 7,
    initialPrimaryBalance: 0.005,
  },
  TR: {
    chamberName: "Grand National Assembly",
    seats: 600,
    method: "pr_dhondt",
    threshold: 0.07,
    termYears: 5,
    nextElectionYear: 2028,
    headTitle: "President",
    naturalUnemployment: 9.5,
    initialPrimaryBalance: -0.02,
  },
  AT: {
    chamberName: "National Council",
    seats: 183,
    method: "pr_hareQuota",
    threshold: 0.04,
    termYears: 5,
    nextElectionYear: 2029,
    headTitle: "Chancellor",
    naturalUnemployment: 5.5,
    initialPrimaryBalance: -0.015,
    namePoolCountry: "DE",
  },
  FI: {
    chamberName: "Eduskunta",
    seats: 200,
    method: "pr_dhondt",
    threshold: 0.01,
    termYears: 4,
    nextElectionYear: 2027,
    headTitle: "Prime Minister",
    naturalUnemployment: 7.5,
    initialPrimaryBalance: -0.02,
  },
  GR: {
    chamberName: "Hellenic Parliament",
    seats: 300,
    method: "mixed",
    threshold: 0.03,
    termYears: 4,
    nextElectionYear: 2027,
    headTitle: "Prime Minister",
    naturalUnemployment: 9.5,
    initialPrimaryBalance: 0.02,
  },
};

/**
 * Leader name pools for background countries the politician name generator
 * has no pool for. Small on purpose: background leaders are named records,
 * not a simulated political class.
 */
export const BACKGROUND_NAME_POOLS: Readonly<
  Record<string, { firstNames: readonly string[]; surnames: readonly string[] }>
> = {
  FI: {
    firstNames: [
      "Mikko",
      "Juha",
      "Antti",
      "Petteri",
      "Sanna",
      "Riikka",
      "Anna-Maja",
      "Jussi",
      "Li",
      "Ville",
      "Elina",
      "Kai",
    ],
    surnames: [
      "Virtanen",
      "Korhonen",
      "Makinen",
      "Nieminen",
      "Heinonen",
      "Laine",
      "Lehtonen",
      "Rantanen",
      "Salminen",
      "Koskinen",
      "Jarvinen",
      "Hamalainen",
    ],
  },
  GR: {
    firstNames: [
      "Giorgos",
      "Kostas",
      "Nikos",
      "Dimitris",
      "Yannis",
      "Maria",
      "Eleni",
      "Katerina",
      "Sofia",
      "Andreas",
      "Panagiotis",
      "Christina",
    ],
    surnames: [
      "Papadopoulos",
      "Georgiou",
      "Nikolaidis",
      "Konstantinou",
      "Dimitriou",
      "Ioannou",
      "Vlachos",
      "Karagiannis",
      "Antoniou",
      "Makris",
      "Pappas",
      "Oikonomou",
    ],
  },
};
