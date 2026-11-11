/**
 * Canada Layer-1 electorate model for the 2027 world, over the province and
 * territory census bundle. Leans run -5 (left, progressive) to +5 (market
 * right, traditional).
 */
// Positions are gameplay estimates shaped by the Canadian Election Study's
// 2021 and 2025 cleavages: francophones sit left of anglophones on the economy
// and are the most secular bloc, the rural Prairies anchor the right, and
// graduates and young urban voters lean left. Turnout centres on the 69%
// Elections Canada reported for April 2025. Regional contrast beyond the
// census mix comes from party organization seeded from the 2025 result.
import type { CountryLayer1Model, DemographicPosition } from "@/lib/seeds/international/types";
import type { EraId } from "@/lib/seeds/presetSelector";
import { caRegionCensusData2027 } from "./data/caRegionCensusData2027";

const CA_GROUP_IDS = [
  "suburban_families",
  "urban_progressives",
  "prairie_conservatives",
  "quebec_francophones",
  "new_canadians",
  "working_families",
  "retirees",
  "business_professionals",
  "indigenous_communities",
] as const;

type GroupId = (typeof CA_GROUP_IDS)[number];
type Composition = CountryLayer1Model["composition"][string];

export const CA_LAYER1_DIMS = ["ethnicity", "age", "education", "income", "urbanization"];

const TURNOUT_RATES: CountryLayer1Model["turnoutRates"] = {
  ethnicity: {
    anglophone: 71,
    francophone: 68,
    indigenous: 48,
    south_asian: 62,
    east_se_asian: 58,
    other_background: 60,
  },
  age: { young: 55, mid: 64, mature: 73, senior: 78 },
  education: { no_certificate: 55, high_school: 63, college_trades: 68, university: 76 },
  income: { low: 58, middle: 68, high: 76 },
  urbanization: { urban: 66, suburban: 69, rural: 68 },
};

const COMPOSITION: Record<GroupId, Composition> = {
  suburban_families: {
    weights: [
      { dim: "urbanization", key: "suburban", w: 0.35 },
      { dim: "age", key: "mid", w: 0.25 },
      { dim: "income", key: "middle", w: 0.25 },
      { dim: "education", key: "college_trades", w: 0.15 },
    ],
    civicMultiplier: 1.0,
  },
  urban_progressives: {
    weights: [
      { dim: "urbanization", key: "urban", w: 0.35 },
      { dim: "education", key: "university", w: 0.35 },
      { dim: "age", key: "young", w: 0.3 },
    ],
    civicMultiplier: 1.0,
  },
  prairie_conservatives: {
    weights: [
      { dim: "urbanization", key: "rural", w: 0.4 },
      { dim: "ethnicity", key: "anglophone", w: 0.25 },
      { dim: "age", key: "mature", w: 0.2 },
      { dim: "education", key: "high_school", w: 0.15 },
    ],
    civicMultiplier: 1.05,
  },
  quebec_francophones: {
    weights: [
      { dim: "ethnicity", key: "francophone", w: 0.6 },
      { dim: "education", key: "college_trades", w: 0.2 },
      { dim: "age", key: "mature", w: 0.2 },
    ],
    civicMultiplier: 1.0,
  },
  new_canadians: {
    weights: [
      { dim: "ethnicity", key: "south_asian", w: 0.3 },
      { dim: "ethnicity", key: "east_se_asian", w: 0.3 },
      { dim: "ethnicity", key: "other_background", w: 0.2 },
      { dim: "urbanization", key: "suburban", w: 0.2 },
    ],
    civicMultiplier: 0.95,
  },
  working_families: {
    weights: [
      { dim: "income", key: "low", w: 0.35 },
      { dim: "education", key: "high_school", w: 0.25 },
      { dim: "education", key: "no_certificate", w: 0.2 },
      { dim: "age", key: "mid", w: 0.2 },
    ],
    civicMultiplier: 0.9,
  },
  retirees: {
    weights: [
      { dim: "age", key: "senior", w: 0.6 },
      { dim: "income", key: "middle", w: 0.2 },
      { dim: "urbanization", key: "suburban", w: 0.2 },
    ],
    civicMultiplier: 1.1,
  },
  business_professionals: {
    weights: [
      { dim: "income", key: "high", w: 0.45 },
      { dim: "education", key: "university", w: 0.3 },
      { dim: "urbanization", key: "urban", w: 0.25 },
    ],
    civicMultiplier: 1.05,
  },
  indigenous_communities: {
    weights: [
      { dim: "ethnicity", key: "indigenous", w: 0.7 },
      { dim: "urbanization", key: "rural", w: 0.3 },
    ],
    civicMultiplier: 0.85,
  },
};

const DEFAULT_LEANS: Record<GroupId, DemographicPosition> = {
  suburban_families: { economicLean: 0.5, socialLean: 0 },
  urban_progressives: { economicLean: -2, socialLean: -3 },
  prairie_conservatives: { economicLean: 3, socialLean: 2.5 },
  quebec_francophones: { economicLean: -1, socialLean: -2 },
  new_canadians: { economicLean: 0.5, socialLean: 0.5 },
  working_families: { economicLean: -1.5, socialLean: 0.5 },
  retirees: { economicLean: 0.5, socialLean: 1.5 },
  business_professionals: { economicLean: 2.5, socialLean: -0.5 },
  indigenous_communities: { economicLean: -2, socialLean: -0.5 },
};

const POSITIONS_2027: Record<string, Record<string, DemographicPosition>> = {
  ethnicity: {
    anglophone: { economicLean: 0.8, socialLean: 0.3 },
    francophone: { economicLean: -1.2, socialLean: -1.5 },
    indigenous: { economicLean: -2.0, socialLean: -0.8 },
    south_asian: { economicLean: 0.5, socialLean: 0.8 },
    east_se_asian: { economicLean: 0.6, socialLean: 0.2 },
    other_background: { economicLean: -0.3, socialLean: -0.5 },
  },
  age: {
    young: { economicLean: -1.5, socialLean: -2.2 },
    mid: { economicLean: 0.3, socialLean: -0.6 },
    mature: { economicLean: 1.0, socialLean: 0.6 },
    senior: { economicLean: 0.6, socialLean: 1.5 },
  },
  education: {
    no_certificate: { economicLean: 0.6, socialLean: 1.8 },
    high_school: { economicLean: 1.0, socialLean: 1.0 },
    college_trades: { economicLean: 0.8, socialLean: 0.2 },
    university: { economicLean: -1.2, socialLean: -1.8 },
  },
  income: {
    low: { economicLean: -1.5, socialLean: 0.4 },
    middle: { economicLean: 0.3, socialLean: 0 },
    high: { economicLean: 1.8, socialLean: -0.4 },
  },
  urbanization: {
    urban: { economicLean: -1.2, socialLean: -1.4 },
    suburban: { economicLean: 0.6, socialLean: 0.2 },
    rural: { economicLean: 1.8, socialLean: 1.8 },
  },
};

function caCensus(): CountryLayer1Model["census"] {
  return Object.fromEntries(
    Object.entries(caRegionCensusData2027).map(([regionId, census]) => [
      regionId,
      {
        ethnicity: census.ethnicity,
        age: census.age,
        education: census.education,
        income: census.income,
        urbanization: census.urbanization,
      },
    ])
  );
}

/** Canada joins the world in 2027; earlier eras have no Canadian electorate. */
export function getCaModel(era: EraId): CountryLayer1Model | null {
  if (era !== "2027") return null;
  return {
    countryId: "CA",
    categoryId: "ca_voterGroups",
    groupIds: [...CA_GROUP_IDS],
    dims: [...CA_LAYER1_DIMS],
    turnoutRates: TURNOUT_RATES,
    positions: POSITIONS_2027,
    composition: COMPOSITION,
    defaultLeans: DEFAULT_LEANS,
    census: caCensus(),
  };
}
