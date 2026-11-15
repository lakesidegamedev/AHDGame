import type { MetricConfig, MetricFormat } from "@/lib/constants/cabinetMechanicsTypes";

/**
 * The metrics a Canadian cabinet panel can show, by short key. Every metric is
 * authored in the provincial seed, so each one has a value in every region.
 */
const m = (
  category: string,
  metricId: string,
  label: string,
  format: MetricFormat,
  higherIsBetter: boolean
): MetricConfig => ({ category, metricId, label, format, higherIsBetter });

export const CA_METRICS = {
  gdp: m("economic", "gdpGrowth", "GDP Growth", "percent", true),
  jobless: m("economic", "unemploymentRate", "Unemployment Rate", "percent", false),
  income: m("economic", "medianIncome", "Median Income", "currency", true),
  cost: m("economic", "costOfLiving", "Cost of Living", "index", false),
  poverty: m("economic", "povertyRate", "Poverty Rate", "percent", false),
  business: m("economic", "smallBusinessFormation", "Business Formation", "index", true),
  productivity: m("economic", "productivityGrowth", "Productivity Growth", "percent", true),
  trade: m("economic", "tradeBalance", "Trade Balance", "percent", true),
  rd: m("economic", "rdIntensity", "R&D Intensity", "percent", true),
  tests: m("education", "testPerformance", "Test Performance", "index", true),
  skills: m("education", "workforceSkill", "Workforce Skill", "index", true),
  doctors: m("healthcare", "physicianRate", "Physicians per 1,000", "rate", true),
  life: m("healthcare", "lifeExpectancy", "Life Expectancy", "number", true),
  mental: m("healthcare", "mentalHealthAccess", "Mental Health Access", "index", true),
  prepared: m("healthcare", "publicHealthPreparedness", "Health Preparedness", "index", true),
  roads: m("infrastructure", "roadCondition", "Road Condition", "index", true),
  broadband: m("infrastructure", "broadbandAccess", "Broadband Access", "percent", true),
  transit: m("infrastructure", "publicTransit", "Public Transit", "index", true),
  grid: m("infrastructure", "powerGridReliability", "Grid Reliability", "percent", true),
  crime: m("publicSafety", "crimeRate", "Crime Rate", "rate", false),
  violent: m("publicSafety", "violentCrimeRate", "Violent Crime Rate", "rate", false),
  safety: m("publicSafety", "publicSafetyConfidence", "Safety Confidence", "index", true),
  air: m("environment", "airQuality", "Air Quality", "index", true),
  renewables: m("environment", "renewableEnergy", "Renewable Energy", "percent", true),
  carbon: m("environment", "carbonEmissions", "Carbon Emissions", "number", false),
  resilience: m("environment", "climateResilience", "Climate Resilience", "index", true),
  mobility: m("social", "socialMobility", "Social Mobility", "index", true),
  inequality: m("social", "incomeInequality", "Income Inequality", "index", false),
  homeless: m("social", "homelessnessRate", "Homelessness", "rate", false),
  food: m("social", "foodInsecurity", "Food Insecurity", "percent", false),
  cohesion: m("social", "socialCohesion", "Social Cohesion", "index", true),
  housing: m("social", "housingAffordability", "Housing Affordability", "index", false),
  approval: m("governance", "governmentApproval", "Government Approval", "index", true),
  trust: m("governance", "publicTrust", "Public Trust", "index", true),
  transparency: m("governance", "governmentTransparency", "Gov. Transparency", "index", true),
  budget: m("governance", "budgetBalance", "Budget Balance", "percent", true),
  debt: m("governance", "debtToGdp", "Debt to GDP", "percent", false),
  corruption: m("governance", "corruptionIndex", "Corruption", "index", false),
  turnout: m("governance", "voterTurnout", "Voter Turnout", "percent", true),
  growth: m("population", "populationGrowth", "Population Growth", "percent", true),
  migration: m("population", "migrationRate", "Net Migration", "rate", true),
  press: m("mediaInformation", "pressFreedom", "Press Freedom", "index", true),
} as const satisfies Record<string, MetricConfig>;

export type CaMetricKey = keyof typeof CA_METRICS;
