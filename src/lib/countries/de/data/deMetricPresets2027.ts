/**
 * German Land metrics for the 2027 world: the 2019 overlay moved by the change
 * each metric has seen since, from the sources below. Länder keep their 2019
 * pattern unless a source moved one against the rest.
 */
import { projectMetricOverlay } from "@/lib/seeds/rules/projectMetricOverlay";
import { deMetricPresets2019, type MetricPresetBundle } from "./deMetricPresets";

export const DE_METRIC_PRESETS_2027_SOURCES = [
  "IMF World Economic Outlook, October 2026: general government gross debt 66.9% of GDP in 2027; current account surplus well below 2019",
  "Destatis: real GDP in 2025 close to its 2019 level; industrial production about 15% below 2019",
  "Destatis: R&D 3.17% of GDP (2019) to 3.11% (2023)",
  "vdp Property Price Index: commercial property values below 2019 after the 2022 to 2024 fall",
  "Destatis building completions: 293,000 dwellings (2019) to about 250,000 (2024), with permits falling further",
  "Federal Network Agency and AGEB: renewables 42% of gross power consumption (2019) to about 55% (2025); last reactors closed April 2023",
  "Skilled Immigration Act (2020, reformed 2023); about 1.1 million refugees from Ukraine",
  "International Federation of Robotics: German robot density 346 (2019) to 429 (2023) per 10,000 workers",
  "Bundeswehr special fund of 100 billion euros (2022) and the 2025 exemption of defence from the debt brake",
  "Destatis: total fertility rate 1.54 (2019) to 1.35 (2024)",
  "Federal Employment Agency: employment at a record of about 46 million",
] as const;

export const deMetricPresets2027: MetricPresetBundle = projectMetricOverlay(deMetricPresets2019, {
  set: { "governance.debtToGdp": 66.9 },
  scale: {
    "economic.rdIntensity": 0.98,
    "economic.commercialValueIndex": 0.88,
  },
  shift: {
    "economic.laborParticipation": 0.5,
    "economic.tradeBalance": -1.5,
    "economic.productivityGrowth": -0.6,
    "economic.manufacturingCompetitiveness": -6,
    "environment.energyTransitionProgress": 10,
    "social.housingAffordability": 5,
    "social.housingSupplyGrowth": -0.4,
    "social.foreignWorkerIntegration": 4,
    "governance.roboticsAdoption": 3,
    "governance.militaryReadiness": 5,
    "population.demographicDecline": 3,
  },
  regionShift: {
    BE: { "social.housingAffordability": 4 },
    HH: { "social.housingAffordability": 2 },
    BY: { "social.housingAffordability": 2 },
  },
});
