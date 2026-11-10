import { WAL_CABINET_SEAT_IDS } from "@/lib/countries/wal/institutionsFacts";
import { SCO_CABINET_SEAT_IDS } from "@/lib/countries/sco/institutionsFacts";
import type { CountryId } from "./countries";
import type { BuildFundingLevel } from "@/lib/db/types/infraProject";
import { JP_CABINET_SEAT_IDS } from "@/lib/countries/jp/institutionsFacts";
import { US_CABINET_SEAT_IDS } from "@/lib/countries/us/institutionsFacts";
import { UK_CABINET_SEAT_IDS } from "@/lib/countries/uk/institutionsFacts";
import { DE_CABINET_SEAT_IDS } from "@/lib/countries/de/institutionsFacts";
import { CN_CABINET_SEAT_IDS } from "@/lib/countries/cn/institutionsFacts";
import { IE_CABINET_SEAT_IDS } from "@/lib/countries/ie/institutionsFacts";
import { RU_CABINET_SEAT_IDS } from "@/lib/countries/ru/institutionsFacts";
import { DD_CABINET_SEAT_IDS } from "@/lib/countries/dd/institutionsFacts";
import { CA_CABINET_SEAT_IDS } from "@/lib/countries/ca/institutionsFacts";

export interface InfraArchetype {
  id: string;
  label: string;
  description: string; // player-facing one-liner: what this asset does mechanically
  icon: string;
  buildDuration: number; // progress units (turns at standard funding)
  outputBase: number;
  upkeepBase: number; // M/turn operational
  constructionCostBase: number; // M/turn while building (× costMult)
  effects: Record<string, number>; // metricPath → standing per-turn delta (operational)
  /**
   * Calendar year this asset class first becomes buildable. Absent = timeless
   * (roads, bridges, rail, airports predate every playable era). Gates
   * anachronistic archetypes out of historical worlds (e.g. broadband rollouts
   * must not seed in 1953/1979). Matches the metric era window that backs the
   * asset (broadbandAccess windows 1998 in the Metric Era Catalog).
   */
  availableFrom?: number;
}

export const INFRA_ARCHETYPES: InfraArchetype[] = [
  {
    id: "highway",
    label: "Highway Expansion",
    description:
      "Improves road condition and closes the infrastructure investment gap in its region.",
    icon: "road",
    buildDuration: 6,
    outputBase: 500,
    upkeepBase: 40,
    constructionCostBase: 120,
    effects: {
      "infrastructure.roadCondition": 0.02,
      "infrastructure.infrastructureInvestmentGap": -0.015,
    },
  },
  {
    id: "transit",
    label: "Transit Line",
    description:
      "Expands public transit coverage and closes part of the infrastructure investment gap in its region.",
    icon: "train",
    buildDuration: 8,
    outputBase: 200,
    upkeepBase: 60,
    constructionCostBase: 180,
    effects: {
      "infrastructure.publicTransit": 0.025,
      "infrastructure.infrastructureInvestmentGap": -0.01,
    },
  },
  {
    id: "bridge",
    label: "Bridge Renewal",
    description: "A quick build that improves road condition in its region for modest upkeep.",
    icon: "bridge",
    buildDuration: 4,
    outputBase: 20,
    upkeepBase: 25,
    constructionCostBase: 80,
    effects: { "infrastructure.roadCondition": 0.02 },
  },
  {
    id: "broadband",
    label: "Broadband Rollout",
    description: "Extends broadband access across its region.",
    icon: "wifi",
    buildDuration: 5,
    outputBase: 100,
    upkeepBase: 30,
    constructionCostBase: 90,
    effects: { "infrastructure.broadbandAccess": 0.025 },
    availableFrom: 1998, // commercial broadband era; matches broadbandAccess metric window
  },
  {
    id: "railway",
    label: "Railway Line",
    description:
      "A long build that raises transport efficiency and closes part of the infrastructure investment gap in its region.",
    icon: "train",
    buildDuration: 9,
    outputBase: 400,
    upkeepBase: 55,
    constructionCostBase: 190,
    effects: {
      "infrastructure.transportEfficiency": 0.025,
      "infrastructure.infrastructureInvestmentGap": -0.015,
    },
    // No availableFrom: mainline rail predates every playable era. Deliberately
    // era-agnostic so the command-economy transport seats (RU "Minister of
    // Railways", DD "Minister of Transport") can build the mode their ministry
    // is named for, rather than only the road-and-airport set.
  },
  {
    id: "freight",
    label: "Freight Corridor",
    description:
      "Improves road condition and lifts GDP growth by speeding goods movement through its region.",
    icon: "truck",
    buildDuration: 7,
    outputBase: 300,
    upkeepBase: 50,
    constructionCostBase: 150,
    effects: { "infrastructure.roadCondition": 0.015, "economic.gdpGrowth": 0.01 },
  },
  {
    id: "airport",
    label: "Airport Upgrade",
    description: "Boosts public transit standing and lifts GDP growth in its region.",
    icon: "plane",
    buildDuration: 7,
    outputBase: 500,
    upkeepBase: 70,
    constructionCostBase: 200,
    effects: { "infrastructure.publicTransit": 0.015, "economic.gdpGrowth": 0.01 },
  },
];

/** Transportation seat per country (clean — never an Estates or Energy seat). */
export const INFRA_POSITION_BY_COUNTRY: Partial<Record<CountryId, string>> = {
  SCO: SCO_CABINET_SEAT_IDS.infrastructure,
  WAL: WAL_CABINET_SEAT_IDS.infrastructure,
  US: US_CABINET_SEAT_IDS.infrastructure,
  UK: UK_CABINET_SEAT_IDS.infrastructure,
  DE: DE_CABINET_SEAT_IDS.infrastructure,
  CN: CN_CABINET_SEAT_IDS.infrastructure,
  JP: JP_CABINET_SEAT_IDS.infrastructure,
  IE: IE_CABINET_SEAT_IDS.infrastructure,
  CA: CA_CABINET_SEAT_IDS.infrastructure,
  RU: RU_CABINET_SEAT_IDS.infrastructure,
  DD: DD_CABINET_SEAT_IDS.infrastructure,
};

export interface BuildFundingDef {
  id: BuildFundingLevel;
  label: string;
  speedMult: number; // progress units added per turn
  costMult: number; // construction spend multiplier
}
export const BUILD_FUNDING: BuildFundingDef[] = [
  { id: "slowed", label: "Slowed", speedMult: 0.5, costMult: 0.6 },
  { id: "standard", label: "Standard", speedMult: 1.0, costMult: 1.0 },
  { id: "crashed", label: "Crashed", speedMult: 1.8, costMult: 1.6 },
];

export const INFRA_EFFECT = { budgetWeight: 0.05 };
export const INFRA_UPKEEP_UNIT = 1_000_000;
export const INFRA_ENVELOPE_FALLBACK_GDP_FRACTION = 0.02;

/** Discretionary slice of the transportation appropriation for the project pipeline. Tunable. */
export const INFRA_DISCRETIONARY_FRACTION = 0.012;

/** Baseline discretionary allowance (millions of local currency); envelope = max(slice, baseline). Tunable. */
export const INFRA_DISCRETIONARY_BASELINE = 3_000;

/** Absolute cap (millions) on the pipeline discretionary budget; envelope = clamp(slice, baseline, cap). */
export const INFRA_DISCRETIONARY_CAP = 5_000;

export interface InfraAggregate {
  building: number;
  operational: number;
  constructionSpend: number; // millions/turn (× costMult)
  operationalUpkeep: number; // millions/turn
  committedSpend: number;
  byRegion: Record<string, { building: number; operational: number }>;
}
