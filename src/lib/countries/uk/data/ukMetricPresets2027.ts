/**
 * UK region metrics for the 2027 world: the 2019 overlay moved by the change
 * each metric has seen since, from the sources below. Regions keep their 2019
 * pattern unless a source moved one region against the rest.
 */
import { projectMetricOverlay } from "@/lib/seeds/rules/projectMetricOverlay";
import { ukMetricPresets2019, type MetricPresetBundle } from "./ukMetricPresets";

export const UK_METRIC_PRESETS_2027_SOURCES = [
  "IMF World Economic Outlook, October 2026: general government gross debt 102.5% of GDP in 2027",
  "ONS Labour Force Survey: economic inactivity of 16 to 64 year olds higher than in 2019 through 2025",
  "ONS labour productivity: output per hour growing about 0.5% a year since 2019",
  "ONS UK House Price Index 2019 to 2025: about 27% nominal against about 31% CPI; London weakest, Northern Ireland and the North strongest",
  "MSCI UK Monthly Property Index: capital values about 15% below 2019 by 2025",
  "NHS England referral to treatment: waiting list 4.4 million (2019) to about 7.4 million (2025); Welsh waits longest",
  "DESNZ Energy Trends: renewables 37% of generation (2019) to over 50% (2024); last coal plant closed September 2024",
  "DWP Households Below Average Income: child poverty after housing costs 30% (2019/20) to 31% (2023/24)",
  "ONS knife or sharp instrument offences higher in 2025 than 2019",
  "MHCLG rough sleeping snapshot: 4,266 (2019) to 4,667 (2024)",
  "International Federation of Robotics: UK robot density rising since 2019",
  "ONS births: total fertility rate in England and Wales 1.63 (2019) to 1.41 (2024)",
  "Ofcom News Consumption Survey: trust in BBC news lower than in 2019",
] as const;

export const ukMetricPresets2027: MetricPresetBundle = projectMetricOverlay(ukMetricPresets2019, {
  set: { "governance.debtToGdp": 102.5 },
  scale: {
    "economic.propertyValueIndex": 0.97,
    "economic.commercialValueIndex": 0.85,
  },
  shift: {
    "economic.laborParticipation": -0.6,
    "economic.productivityGrowth": -0.4,
    "education.universityEnrollment": 1,
    "healthcare.nhsWaitingTime": 5,
    "healthcare.mentalHealthAccess": -2,
    "healthcare.socialCareQuality": -2,
    "publicSafety.knifeCrimeRate": 0.3,
    "environment.energyTransitionProgress": 10,
    "social.childPoverty": 1,
    "social.roughSleeping": 0.2,
    "social.foreignWorkerIntegration": 3,
    "governance.roboticsAdoption": 3,
    "population.demographicDecline": 4,
    "mediaInformation.bbcTrust": -4,
  },
  regionShift: {
    LON: { "economic.propertyValueIndex": -12, "social.housingAffordability": -1 },
    SEE: { "economic.propertyValueIndex": -4 },
    NEE: { "economic.propertyValueIndex": 6 },
    NWE: { "economic.propertyValueIndex": 5 },
    YHU: { "economic.propertyValueIndex": 4 },
    WAL: { "economic.propertyValueIndex": 4, "healthcare.nhsWaitingTime": 3 },
    SCO: { "economic.propertyValueIndex": 3 },
    NIR: { "economic.propertyValueIndex": 12 },
  },
});
