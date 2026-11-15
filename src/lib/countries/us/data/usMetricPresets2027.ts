/**
 * US region metrics for the 2027 world: the 2019 overlay moved by the change
 * each metric has seen since, from the sources below. Regions keep their 2019
 * pattern unless a source moved one state against the rest.
 */
import { projectMetricOverlay } from "@/lib/seeds/rules/projectMetricOverlay";
import { usMetricPresets2019, type MetricPresetBundle } from "./usMetricPresets";

export const US_METRIC_PRESETS_2027_SOURCES = [
  "IMF World Economic Outlook, October 2026: general government gross debt 128.7% of GDP in 2027",
  "BLS Current Population Survey: labour force participation 63.1% (2019) to 62.3% (2025)",
  "BLS productivity and costs: nonfarm output per hour averaging about 1.8% a year 2019 to 2025",
  "NSF National Center for Science and Engineering Statistics: R&D 3.1% of GDP (2019) to 3.5% (2023)",
  "FHFA House Price Index, 2019Q4 to 2025Q2, deflated by CPI: about 18% real; fastest in ID, MT, FL, UT, TN, ME; slowest in DC, LA, ND, AK, IL",
  "Green Street Commercial Property Price Index: about 10% below 2019 in nominal terms by 2025",
  "Census Bureau ACS: uninsured 9.2% (2019) to 8.2% (2024); Medicaid expansion since 2019 in VA, ID, UT, NE, OK, MO, SD, NC; CBO expects coverage losses from 2026",
  "Census Bureau SPM: child poverty 12.6% (2019) to 13.4% (2024)",
  "NAR Housing Affordability Index: about 160 (2019) to about 100 (2024)",
  "HUD Annual Homeless Assessment Report: 568,000 (2019) to 771,000 (2024)",
  "EIA Electric Power Monthly: renewables 17.6% of generation (2019) to about 24% (2025)",
  "International Federation of Robotics: US robot density 228 (2019) to 295 (2023) per 10,000 workers",
  "Gallup: adults extremely or very proud to be American 70% (2019) to 58% (2025)",
  "CBP southwest border encounters at multi-decade lows in 2025",
  "CDC NCHS: total fertility rate 1.71 (2019) to 1.60 (2024)",
] as const;

const MEDICAID_EXPANSION_SINCE_2019 = ["VA", "ID", "UT", "NE", "OK", "MO", "SD", "NC"];

export const usMetricPresets2027: MetricPresetBundle = projectMetricOverlay(usMetricPresets2019, {
  set: { "governance.debtToGdp": 129 },
  scale: {
    "economic.rdIntensity": 1.12,
    "economic.propertyValueIndex": 1.18,
    "economic.commercialValueIndex": 0.82,
  },
  shift: {
    "economic.laborParticipation": -0.8,
    "economic.productivityGrowth": 0.6,
    "economic.tradeBalance": -0.4,
    "healthcare.uninsuredRate": 0.5,
    "healthcare.mentalHealthAccess": 3,
    "environment.energyTransitionProgress": 8,
    "social.childPoverty": 1,
    "social.housingAffordability": 9,
    "social.roughSleeping": 1.5,
    "social.housingSupplyGrowth": 0.2,
    "governance.roboticsAdoption": 6,
    "governance.nationalPride": -10,
    "governance.borderSecurity": 8,
    "population.demographicDecline": 3,
  },
  regionShift: {
    ...Object.fromEntries(
      MEDICAID_EXPANSION_SINCE_2019.map((state) => [state, { "healthcare.uninsuredRate": -2 }])
    ),
    ID: { "healthcare.uninsuredRate": -2, "economic.propertyValueIndex": 10 },
    UT: { "healthcare.uninsuredRate": -2, "economic.propertyValueIndex": 8 },
    MT: { "economic.propertyValueIndex": 10 },
    FL: { "economic.propertyValueIndex": 10 },
    TN: { "economic.propertyValueIndex": 8 },
    ME: { "economic.propertyValueIndex": 8 },
    DC: { "economic.propertyValueIndex": -15 },
    LA: { "economic.propertyValueIndex": -8 },
    ND: { "economic.propertyValueIndex": -8 },
    AK: { "economic.propertyValueIndex": -8 },
    IL: { "economic.propertyValueIndex": -6 },
  },
});
