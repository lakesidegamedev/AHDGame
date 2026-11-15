export const POLICY_DOMAINS = [
  "economic",
  "education",
  "healthcare",
  "infrastructure",
  "publicSafety",
  "environment",
  "social",
  "governance",
];

// Metric options for each category
export const METRIC_OPTIONS: Record<string, string[]> = {
  economic: [
    "unemploymentRate",
    "medianIncome",
    "gdpGrowth",
    "povertyRate",
    "costOfLiving",
    "smallBusinessFormation",
    "economicFreedom",
    "regulatoryBurden",
  ],
  education: [
    "highSchoolGradRate",
    "testPerformance",
    "educationSpending",
    "literacyRate",
    "workforceSkill",
  ],
  healthcare: [
    "uninsuredRate",
    "affordabilityIndex",
    "physicianRate",
    "lifeExpectancy",
    "preventableMortality",
    "publicHealthPreparedness",
  ],
  infrastructure: [
    "roadCondition",
    "broadbandAccess",
    "publicTransit",
    "waterQuality",
    "powerGridReliability",
    "infrastructureInvestmentGap",
  ],
  publicSafety: [
    "crimeRate",
    "violentCrimeRate",
    "policePerCapita",
    "incarcerationRate",
    "emergencyResponse",
    "publicSafetyConfidence",
    // Axis metric (P6d pattern)
    "firearmRights",
  ],
  environment: [
    "airQuality",
    "renewableEnergy",
    "carbonEmissions",
    "recyclingRate",
    "climateResilience",
    "protectedLand",
  ],
  social: [
    "socialMobility",
    "incomeInequality",
    "homelessnessRate",
    "foodInsecurity",
    "civicParticipation",
    "socialCohesion",
  ],
  governance: [
    "governmentTransparency",
    "budgetBalance",
    "corruptionIndex",
    "voterTurnout",
    "publicTrust",
    // P6a axis metrics
    "civilLiberties",
    "nationalPride",
    "militaryReadiness",
    "borderSecurity",
  ],
  population: ["populationGrowth", "urbanizationRate", "medianAge", "migrationRate"],
  mediaInformation: [
    "mediaPolarization",
    "disinformationRisk",
    "pressFreedom",
    "socialMediaSentiment",
    "newsTrust",
    "stateMediaControl",
  ],
};

// Committee names by policy domain
export const COMMITTEE_NAMES: Record<string, string> = {
  economic: "Finance",
  education: "Education",
  healthcare: "Health",
  infrastructure: "Transportation",
  publicSafety: "Judiciary",
  environment: "Environment",
  social: "Social Services",
  governance: "Government Affairs",
};
