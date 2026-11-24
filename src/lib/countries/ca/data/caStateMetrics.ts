import type { StateMetrics } from "@/lib/db/types";
import { withUniformMetricSet } from "@/lib/seeds/shared/uniformStateMetrics";

/**
 * Canada's provincial opening metrics for the 2027 world.
 *
 * Sources: Statistics Canada (labour force survey, income, life tables, crime
 * severity), Canadian Institute for Health Information, Environment and Climate
 * Change Canada (greenhouse gas inventory), Canada Mortgage and Housing
 * Corporation, OECD (PISA, health and inequality), Elections Canada (turnout).
 * Values are rounded; incomes are in Canadian dollars. Units follow the other
 * country seeds: percentages, indexes where 100 is the national mean, per-100k
 * rates, and years.
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
    crimeRate: mv(2_230),
    violentCrimeRate: mv(372),
    policePerCapita: mv(1.9),
    incarcerationRate: mv(90),
    recidivismRate: mv(40),
    publicSafetyConfidence: mv(68),
  },
  environment: {
    airQuality: mv(67.0),
    renewableEnergy: mv(66),
    carbonEmissions: mv(14.2),
    recyclingRate: mv(30),
    climateResilience: mv(60),
    protectedLand: mv(14),
  },
  social: {
    socialMobility: mv(66),
    incomeInequality: mv(30),
    homelessnessRate: mv(15),
    foodInsecurity: mv(18.4),
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
    voterTurnout: mv(69),
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

/**
 * Sourced provincial values, merged before OVERRIDES. Crime per 100k: StatCan
 * 35-10-0177-01 (2025), violent in FBI categories; crimeRate adds property.
 * Incarceration: 35-10-0154-01 (2023) scaled to 90. Food insecurity:
 * 13-10-0834-01 (2024). Turnout: Elections Canada 2025. Renewables: CER 2023.
 * Carbon: 38-10-0097-01 over 17-10-0009-01, energy-CO2 basis. Protected land:
 * ECCC 2025. Air: ECCC PM2.5 2021-2023. Physicians: CIHI 2025 (not Ontario).
 * Public trust: 45-10-0073-01 (2024) high confidence in police, courts and
 * Parliament, scaled to 55; territories unsurveyed. Transparency and corruption
 * have no provincial source and stay national.
 */
const SOURCED: Record<string, Partial<Record<MetricPath, number>>> = {
  CA_NL: {
    "publicSafety.violentCrimeRate": 324.6,
    "publicSafety.crimeRate": 1843.4,
    "publicSafety.incarcerationRate": 84.8,
    "social.foodInsecurity": 20.4,
    "governance.voterTurnout": 65.8,
    "environment.renewableEnergy": 97.4,
    "environment.carbonEmissions": 11.0,
    "environment.protectedLand": 7.0,
    "environment.airQuality": 80.8,
    "healthcare.physicianRate": 3.14,
    "governance.publicTrust": 49.5,
  },
  CA_PE: {
    "publicSafety.violentCrimeRate": 225.6,
    "publicSafety.crimeRate": 1632.6,
    "publicSafety.incarcerationRate": 92.5,
    "social.foodInsecurity": 18.9,
    "governance.voterTurnout": 78.7,
    "environment.renewableEnergy": 99.1,
    "environment.carbonEmissions": 6.8,
    "environment.protectedLand": 5.6,
    "environment.airQuality": 80.8,
    "healthcare.physicianRate": 2.47,
    "governance.publicTrust": 55.3,
  },
  CA_NS: {
    "publicSafety.violentCrimeRate": 301.7,
    "publicSafety.crimeRate": 2549.0,
    "publicSafety.incarcerationRate": 71.9,
    "social.foodInsecurity": 19.7,
    "governance.voterTurnout": 72.3,
    "environment.renewableEnergy": 29.5,
    "environment.carbonEmissions": 9.6,
    "environment.protectedLand": 14.4,
    "environment.airQuality": 80.8,
    "healthcare.physicianRate": 3.21,
    "governance.publicTrust": 51.4,
  },
  CA_NB: {
    "publicSafety.violentCrimeRate": 355.8,
    "publicSafety.crimeRate": 2230.9,
    "publicSafety.incarcerationRate": 80.9,
    "social.foodInsecurity": 20.9,
    "governance.voterTurnout": 73.1,
    "environment.renewableEnergy": 34,
    "environment.carbonEmissions": 14.4,
    "environment.protectedLand": 10.4,
    "environment.airQuality": 80.8,
    "healthcare.physicianRate": 2.94,
    "governance.publicTrust": 56.3,
  },
  CA_QC: {
    "publicSafety.violentCrimeRate": 365.6,
    "publicSafety.crimeRate": 1435.9,
    "publicSafety.incarcerationRate": 78.5,
    "social.foodInsecurity": 12.1,
    "governance.voterTurnout": 67.9,
    "environment.renewableEnergy": 99.6,
    "environment.carbonEmissions": 7.9,
    "environment.protectedLand": 17.0,
    "environment.airQuality": 69.2,
    "healthcare.physicianRate": 3.01,
    "governance.publicTrust": 68.0,
  },
  CA_ON: {
    "publicSafety.violentCrimeRate": 293.9,
    "publicSafety.crimeRate": 2037.1,
    "publicSafety.incarcerationRate": 84.8,
    "social.foodInsecurity": 20.2,
    "governance.voterTurnout": 69.1,
    "environment.renewableEnergy": 35,
    "environment.carbonEmissions": 8.0,
    "environment.protectedLand": 11.2,
    "environment.airQuality": 67.8,
    "governance.publicTrust": 51.9,
  },
  CA_MB: {
    "publicSafety.violentCrimeRate": 838.0,
    "publicSafety.crimeRate": 3623.9,
    "publicSafety.incarcerationRate": 202.0,
    "social.foodInsecurity": 22.3,
    "governance.voterTurnout": 67.2,
    "environment.renewableEnergy": 99.7,
    "environment.carbonEmissions": 11.0,
    "environment.protectedLand": 11.1,
    "environment.airQuality": 52.6,
    "healthcare.physicianRate": 2.7,
    "governance.publicTrust": 52.8,
  },
  CA_SK: {
    "publicSafety.violentCrimeRate": 829.8,
    "publicSafety.crimeRate": 3462.3,
    "publicSafety.incarcerationRate": 276.5,
    "social.foodInsecurity": 19.7,
    "governance.voterTurnout": 67.9,
    "environment.renewableEnergy": 19.5,
    "environment.carbonEmissions": 47.8,
    "environment.protectedLand": 9.8,
    "environment.airQuality": 52.6,
    "healthcare.physicianRate": 2.45,
    "governance.publicTrust": 51.1,
  },
  CA_AB: {
    "publicSafety.violentCrimeRate": 419.2,
    "publicSafety.crimeRate": 3018.5,
    "publicSafety.incarcerationRate": 105.4,
    "social.foodInsecurity": 22.8,
    "governance.voterTurnout": 69.6,
    "environment.renewableEnergy": 19.9,
    "environment.carbonEmissions": 43.2,
    "environment.protectedLand": 15.6,
    "environment.airQuality": 52.6,
    "healthcare.physicianRate": 2.82,
    "governance.publicTrust": 50.8,
  },
  CA_BC: {
    "publicSafety.violentCrimeRate": 320.5,
    "publicSafety.crimeRate": 2611.1,
    "publicSafety.incarcerationRate": 45.9,
    "social.foodInsecurity": 17.4,
    "governance.voterTurnout": 69.2,
    "environment.renewableEnergy": 97.2,
    "environment.carbonEmissions": 10.4,
    "environment.protectedLand": 20.0,
    "environment.airQuality": 71.4,
    "healthcare.physicianRate": 3.32,
    "governance.publicTrust": 49.0,
  },
  CA_YT: {
    "publicSafety.violentCrimeRate": 919.7,
    "publicSafety.crimeRate": 4368.5,
    "publicSafety.incarcerationRate": 123.1,
    "social.foodInsecurity": 13.0,
    "governance.voterTurnout": 72.5,
    "environment.renewableEnergy": 87.8,
    "environment.carbonEmissions": 10.1,
    "environment.protectedLand": 21.1,
    "environment.airQuality": 59.0,
    "healthcare.physicianRate": 2.27,
  },
  CA_NT: {
    "publicSafety.violentCrimeRate": 2230.7,
    "publicSafety.crimeRate": 6481.0,
    "publicSafety.incarcerationRate": 283.0,
    "social.foodInsecurity": 12.6,
    "governance.voterTurnout": 54.9,
    "environment.renewableEnergy": 22.1,
    "environment.carbonEmissions": 30.4,
    "environment.protectedLand": 17.6,
    "environment.airQuality": 59.0,
    "healthcare.physicianRate": 1.58,
  },
  CA_NU: {
    "publicSafety.violentCrimeRate": 3040.9,
    "publicSafety.crimeRate": 6002.9,
    "publicSafety.incarcerationRate": 544.7,
    "social.foodInsecurity": 53.2,
    "governance.voterTurnout": 35.4,
    "environment.renewableEnergy": 0,
    "environment.carbonEmissions": 19.8,
    "environment.protectedLand": 10.2,
    "environment.airQuality": 59.0,
    "healthcare.physicianRate": 0.72,
  },
};

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
    "social.housingAffordability": 62,
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
    "healthcare.lifeExpectancy": 83.1,
  },
  CA_AB: {
    "economic.medianIncome": 96_000,
    "economic.costOfLiving": 104,
    "economic.unemploymentRate": 6.8,
    "economic.gdpGrowth": 2.4,
    // Independence support in 2025 polling ran roughly 20 to 30 percent;
    // seeded low in that band, well under the referendum request threshold.
    "governance.independenceDesire": 24,
    "governance.budgetBalance": 0.4,
    "governance.debtToGdp": 9,
    "population.populationGrowth": 1.4,
    "population.medianAge": 38,
  },
  CA_MB: {
    "economic.medianIncome": 79_000,
    "economic.costOfLiving": 92,
    "economic.unemploymentRate": 5.2,
    "governance.debtToGdp": 36,
  },
  CA_SK: {
    "economic.medianIncome": 86_000,
    "economic.costOfLiving": 94,
    "economic.unemploymentRate": 5.0,
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
  },
  CA_NT: {
    "economic.medianIncome": 110_000,
    "economic.costOfLiving": 140,
    "economic.unemploymentRate": 6.0,
    "population.urbanizationRate": 58,
  },
  CA_NU: {
    "economic.medianIncome": 80_000,
    "economic.costOfLiving": 165,
    "economic.unemploymentRate": 12.0,
    "economic.povertyRate": 28,
    "population.urbanizationRate": 0,
    "population.medianAge": 27,
    "healthcare.lifeExpectancy": 70.6,
  },
};

/** Merge the baseline with per-region overrides, keeping the full shape intact. */
function isMetricGroup(value: unknown): value is Record<string, ReturnType<typeof mv>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildMetrics(regionId: string): StateMetrics {
  const merged = structuredClone(BASELINE);
  const groups: Record<string, unknown> = merged;
  for (const [path, value] of Object.entries({ ...SOURCED[regionId], ...OVERRIDES[regionId] })) {
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
