/**
 * Chinese macro-region metrics for the 2027 world: the 2019 overlay moved by
 * the change each metric has seen since, from the sources below. Regions keep
 * their 2019 pattern unless a source moved one against the rest.
 */
import { projectMetricOverlay } from "@/lib/seeds/rules/projectMetricOverlay";
import { cnMetricPresets2019, type MetricPresetBundle } from "./cnMetricPresets";

export const CN_METRIC_PRESETS_2027_SOURCES = [
  "IMF World Economic Outlook, October 2026: general government gross debt 109.1% of GDP in 2027 (augmented definition excluded)",
  "National Bureau of Statistics: 70-city home prices falling since 2021; housing starts down by more than half from the 2021 peak",
  "National Bureau of Statistics: R&D 2.24% of GDP (2019) to 2.68% (2024); real growth 6.0% (2019) to about 5% (2024 and 2025)",
  "National Energy Administration: non-fossil power capacity above half of the total by 2024; wind and solar above 1,400 GW",
  "International Federation of Robotics: robot density 187 (2019) to 470 (2023) per 10,000 workers",
  "General Administration of Customs: record goods trade surplus in 2024 and 2025",
  "National Bureau of Statistics: births 14.65 million (2019) to 9.54 million (2024); population falling since 2022; urban youth unemployment above 15%",
  "Ministry of Education: gross tertiary enrolment 51.6% (2019) to 60.8% (2024)",
] as const;

export const cnMetricPresets2027: MetricPresetBundle = projectMetricOverlay(cnMetricPresets2019, {
  set: { "governance.debtToGdp": 109.1 },
  scale: {
    "economic.rdIntensity": 1.2,
    "economic.propertyValueIndex": 0.82,
    "economic.commercialValueIndex": 0.8,
  },
  shift: {
    "economic.laborParticipation": -1,
    "economic.matchingFriction": 0.6,
    "economic.productivityGrowth": -0.5,
    "economic.tradeBalance": 2,
    "economic.manufacturingCompetitiveness": 3,
    "education.universityEnrollment": 6,
    "environment.energyTransitionProgress": 10,
    "social.housingAffordability": -5,
    "social.housingSupplyGrowth": -1.4,
    "governance.roboticsAdoption": 10,
    "population.demographicDecline": 8,
  },
});
