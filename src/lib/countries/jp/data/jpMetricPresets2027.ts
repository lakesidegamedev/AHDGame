/**
 * Japanese region metrics for the 2027 world: the 2019 overlay moved by the
 * change each metric has seen since, from the sources below. Regions keep
 * their 2019 pattern unless a source moved one against the rest.
 */
import { projectMetricOverlay } from "@/lib/seeds/rules/projectMetricOverlay";
import { jpMetricPresets2019, type MetricPresetBundle } from "./jpMetricPresets";

export const JP_METRIC_PRESETS_2027_SOURCES = [
  "IMF World Economic Outlook, October 2026: general government gross debt 196.4% of GDP in 2027",
  "Statistics Bureau Labour Force Survey: participation 62.1% (2019) to about 63% (2025)",
  "MLIT land price publication and Real Estate Economic Institute: Tokyo condominium prices far above 2019; national land prices rising since 2022",
  "Agency for Natural Resources and Energy: renewables about 18% of generation (FY2019) to about 23% (FY2024); more reactors restarted",
  "Ministry of Health, Labour and Welfare: foreign workers 1.66 million (2019) to 2.3 million (2024); Specified Skilled Worker programme widened",
  "Ministry of Health, Labour and Welfare vital statistics: births 865,000 (2019) to 686,000 (2024)",
  "Work Style Reform overtime caps (2019, extended to drivers and doctors in 2024)",
  "2022 National Security Strategy and Defense Buildup Program",
] as const;

export const jpMetricPresets2027: MetricPresetBundle = projectMetricOverlay(jpMetricPresets2019, {
  set: { "governance.debtToGdp": 196.4 },
  scale: { "economic.propertyValueIndex": 1.1 },
  shift: {
    "economic.laborParticipation": 0.9,
    "economic.productivityGrowth": 0.2,
    "environment.energyTransitionProgress": 6,
    "environment.nuclearSafety": 3,
    "social.housingAffordability": 2,
    "social.workLifeBalance": 3,
    "social.foreignWorkerIntegration": 6,
    "governance.roboticsAdoption": 2,
    "governance.militaryReadiness": 5,
    "population.demographicDecline": 6,
  },
  regionShift: {
    KAN: { "economic.propertyValueIndex": 12, "social.housingAffordability": 6 },
    KNS: { "economic.propertyValueIndex": 4 },
  },
});
