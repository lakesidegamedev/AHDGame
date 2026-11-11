import type { StateMetrics } from "@/lib/db/types";
import { withUniformMetricSet } from "@/lib/seeds/shared/uniformStateMetrics";

/**
 * Canada's provincial opening metrics for the 2027 world.
 *
 * Sources: Statistics Canada (labour force survey, income, life tables, crime
 * severity), Canadian Institute for Health Information, Environment and Climate
 * Change Canada (greenhouse gas inventory), Canada Mortgage and Housing
 * Corporation, OECD (PISA, health and inequality), Elections Canada (turnout).
 * Values are rounded and tuned for play; incomes are in Canadian dollars.
 *
 * Units follow the other country seeds: percentages, indexes where 100 is the
 * national mean, per-100k rates, and years.
 */

function mv(value: number, trend?: number) {
  return { value, trend };
}

/** National baseline. Each region overrides a few values via `OVERRIDES`. */
const BASELINE: Omit<StateMetrics, "_id" | "lastUpdated"> = {
  economic: {
    unemploymentRate: mv(6.2),
    medianIncome: mv(84_000),
    gdpGrowth: mv(1.6),
    povertyRate: mv(9.9),
    costOfLiving: mv(100),
    smallBusinessFormation: mv(7.5),
    laborParticipation: mv(65),
    matchingFriction: mv(2.4),
    tradeBalance: mv(-0.5),
    productivityGrowth: mv(0.3),
    rdIntensity: mv(1.6),
  },
  education: {
    testPerformance: mv(88),
    educationSpending: mv(10_800),
    literacyRate: mv(99),
    workforceSkill: mv(80),
  },
  healthcare: {
    physicianRate: mv(2.8),
    lifeExpectancy: mv(82.6),
    preventableMortality: mv(125),
    publicHealthPreparedness: mv(70),
    mentalHealthAccess: mv(52),
  },
  infrastructure: {
    roadCondition: mv(62),
    broadbandAccess: mv(90),
    publicTransit: mv(52),
    waterQuality: mv(90),
    powerGridReliability: mv(99.9),
    infrastructureInvestmentGap: mv(34),
  },
  publicSafety: {
    crimeRate: mv(5_900),
    violentCrimeRate: mv(1_300),
    policePerCapita: mv(1.9),
    incarcerationRate: mv(90),
    recidivismRate: mv(40),
    publicSafetyConfidence: mv(68),
  },
  environment: {
    airQuality: mv(86),
    renewableEnergy: mv(68),
    carbonEmissions: mv(14.2),
    recyclingRate: mv(30),
    climateResilience: mv(60),
    protectedLand: mv(13.5),
  },
  social: {
    socialMobility: mv(66),
    incomeInequality: mv(30),
    homelessnessRate: mv(15),
    foodInsecurity: mv(12),
    civicParticipation: mv(58),
    socialCohesion: mv(66),
    housingAffordability: mv(70),
    housingSupplyGrowth: mv(1.1),
  },
  governance: {
    governmentTransparency: mv(78),
    budgetBalance: mv(-1.8),
    debtToGdp: mv(41),
    corruptionIndex: mv(23),
    voterTurnout: mv(62),
    publicTrust: mv(55),
  },
  population: {
    populationGrowth: mv(0.5),
    urbanizationRate: mv(82),
    medianAge: mv(41),
    migrationRate: mv(0.6),
  },
  mediaInformation: {
    mediaPolarization: mv(36),
    disinformationRisk: mv(34),
    pressFreedom: mv(82),
    socialMediaSentiment: mv(54),
    newsTrust: mv(50),
  },
};

type MetricPath = `${Exclude<keyof typeof BASELINE, never>}.${string}`;

/** Per-region deltas from the baseline, keyed by `category.metric`. */
const OVERRIDES: Record<string, Partial<Record<MetricPath, number>>> = {
  CA_ON: {
    "economic.medianIncome": 88_000,
    "economic.costOfLiving": 112,
    "social.housingAffordability": 82,
    "population.urbanizationRate": 87,
  },
  CA_QC: {
    "economic.medianIncome": 78_000,
    "economic.costOfLiving": 92,
    "economic.unemploymentRate": 4.9,
    "education.educationSpending": 11_200,
    "environment.renewableEnergy": 96,
    "environment.carbonEmissions": 9.8,
    "social.housingAffordability": 62,
    "governance.voterTurnout": 66,
    // Support for a Yes to sovereignty ran roughly 30 to 38 percent across
    // 2025 Leger, Pallas Data and CROP polling; seeded inside that band.
    "governance.independenceDesire": 35,
    "population.urbanizationRate": 81,
  },
  CA_BC: {
    "economic.medianIncome": 86_000,
    "economic.costOfLiving": 115,
    "economic.unemploymentRate": 5.8,
    "social.housingAffordability": 88,
    "social.homelessnessRate": 24,
    "environment.renewableEnergy": 90,
    "environment.carbonEmissions": 9.5,
    "healthcare.lifeExpectancy": 83.1,
    "publicSafety.crimeRate": 7_900,
  },
  CA_AB: {
    "economic.medianIncome": 96_000,
    "economic.costOfLiving": 104,
    "economic.unemploymentRate": 6.8,
    "economic.gdpGrowth": 2.4,
    "environment.renewableEnergy": 17,
    "environment.carbonEmissions": 62,
    "governance.budgetBalance": 0.4,
    "governance.debtToGdp": 9,
    "population.populationGrowth": 1.4,
    "population.medianAge": 38,
  },
  CA_MB: {
    "economic.medianIncome": 79_000,
    "economic.costOfLiving": 92,
    "economic.unemploymentRate": 5.2,
    "environment.renewableEnergy": 97,
    "publicSafety.crimeRate": 9_400,
    "governance.debtToGdp": 36,
  },
  CA_SK: {
    "economic.medianIncome": 86_000,
    "economic.costOfLiving": 94,
    "economic.unemploymentRate": 5.0,
    "environment.renewableEnergy": 24,
    "environment.carbonEmissions": 64,
    "publicSafety.crimeRate": 10_800,
    "population.medianAge": 39,
  },
  CA_NS: {
    "economic.medianIncome": 72_000,
    "economic.costOfLiving": 96,
    "economic.unemploymentRate": 7.0,
    "population.medianAge": 44,
    "social.housingAffordability": 68,
  },
  CA_NB: {
    "economic.medianIncome": 70_000,
    "economic.costOfLiving": 90,
    "economic.unemploymentRate": 7.5,
    "population.medianAge": 45,
    "population.urbanizationRate": 54,
  },
  CA_NL: {
    "economic.medianIncome": 72_000,
    "economic.costOfLiving": 96,
    "economic.unemploymentRate": 10.5,
    "population.medianAge": 47,
    "population.urbanizationRate": 59,
    "governance.debtToGdp": 52,
  },
  CA_PE: {
    "economic.medianIncome": 70_000,
    "economic.costOfLiving": 93,
    "economic.unemploymentRate": 7.6,
    "population.medianAge": 43,
    "population.urbanizationRate": 47,
  },
  CA_YT: {
    "economic.medianIncome": 98_000,
    "economic.costOfLiving": 125,
    "economic.unemploymentRate": 4.2,
    "population.urbanizationRate": 76,
    "publicSafety.crimeRate": 18_000,
  },
  CA_NT: {
    "economic.medianIncome": 110_000,
    "economic.costOfLiving": 140,
    "economic.unemploymentRate": 6.0,
    "population.urbanizationRate": 58,
    "publicSafety.crimeRate": 40_000,
  },
  CA_NU: {
    "economic.medianIncome": 80_000,
    "economic.costOfLiving": 165,
    "economic.unemploymentRate": 12.0,
    "economic.povertyRate": 28,
    "social.foodInsecurity": 46,
    "population.urbanizationRate": 0,
    "population.medianAge": 27,
    "healthcare.lifeExpectancy": 70.6,
    "publicSafety.crimeRate": 55_000,
  },
};

/** Merge the baseline with per-region overrides, keeping the full shape intact. */
function isMetricGroup(value: unknown): value is Record<string, ReturnType<typeof mv>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildMetrics(regionId: string): StateMetrics {
  const merged = structuredClone(BASELINE);
  const groups: Record<string, unknown> = merged;
  for (const [path, value] of Object.entries(OVERRIDES[regionId] ?? {})) {
    const [category, metric] = path.split(".");
    const group = category ? groups[category] : undefined;
    if (value !== undefined && metric && isMetricGroup(group)) group[metric] = mv(value);
  }
  return withUniformMetricSet({
    ...merged,
    _id: regionId,
    countryId: "CA",
    lastUpdated: new Date(),
  });
}

export const caStateMetrics: StateMetrics[] = Object.keys(OVERRIDES).map(buildMetrics);
