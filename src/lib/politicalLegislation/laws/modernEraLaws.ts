import { EARLIER_BAND_SPECS_1 } from "@/lib/politicalLegislation/laws/modernEraLaws/1";
import { EARLIER_BAND_SPECS_2 } from "@/lib/politicalLegislation/laws/modernEraLaws/2";
import { EARLIER_BAND_SPECS_3 } from "@/lib/politicalLegislation/laws/modernEraLaws/3";
/**
 * Later-era national laws for the US, UK, DE, JP and CN law books: the 2027 band (AI
 * liability, data protection, housing supply, critical minerals, cyber
 * resilience, platform content, and the climate laws: carbon price, coal
 * phase-out, clean power standard), the 2030 band (automation tax, wage
 * insurance, carbon border adjustment, heat standards, pension age indexation,
 * nuclear licensing), the 2035 band (climate adaptation fund, managed retreat,
 * basic income pilot, gene editing, space traffic) and the 2040 band
 * (automation dividend, four-day week, digital currency, sovereign wealth
 * fund), the 2045 band (longevity care, fossil fuel sunset, digital
 * self-ownership, water security) and the 2050 band (advanced AI oversight,
 * lifelong pension account, zero carbon economy, space resources). The 2045 and
 * 2050 bands also reach RU and DD. The same laws exist in the legacy catalogue
 * for IE (seeds/shared/modernEraLegislation.ts).
 *
 * The automation policy track (retraining guarantee, hiring subsidy,
 * automation pension levy, transition compacts) is authored in
 * modernEraLawsAutomation.ts and joins the 2030 and 2035 bands.
 *
 * Every law carries an era `window`: it cannot be filed before its first year,
 * and an enacted one stays in force whatever the year. The automation tax also
 * closes to new bills in 2040, when the automation dividend replaces it; later
 * retirements name their successor in `successor`. They are national only.
 * A `both` law with a window would need year-aware regional read fallbacks
 * (see regionalDefaults.test.ts), so zoning and heat standards have no state
 * variant.
 *
 * Winners are the positive targets. Payers come through the same channels the
 * rest of the book uses: a cost on a budget line, and one negative target (the
 * metric the law trades away). The automation tax, the carbon price and the
 * carbon border adjustment raise real revenue through gdpRevenueFraction, as do the
 * automation dividend (a levy paid back out as a dividend), digital currency
 * (seigniorage) and the sovereign wealth fund (its returns). Pension age
 * indexation carries a negative cost from its second rung: a saving on the
 * pension line.
 * In energy transition worlds the climate laws and the minerals recycling
 * duty also reach firms' input costs and emissions (energyTransition/rules).
 *
 * Every law seeds at level 0, so adding them moves no day-one budget, metric
 * or equilibrium.
 */

import type { PoliticalMetricCategoryId, PoliticalMetricId } from "../../politicalMetrics/types";
import type { LawLevel, PoliticalLaw } from "../types";
import { AUTOMATION_BAND_SPECS } from "./modernEraLawsAutomation";
import { LATE_BAND_SPECS } from "./modernEraLawsLate";
import type { ModernEraBookCountryId } from "./modernEraCountries";

type ModernLawCountry = ModernEraBookCountryId | "RU" | "DD";

/** Countries whose budget lines follow the UK authoring rather than the US one. */
const UK_BUDGET_STYLE = new Set<ModernLawCountry>(["DE", "JP", "CN"]);

/** Text that differs by country; a plain string is shared. */
type Copy = string | { US: string; UK: string };

interface LevelSpec {
  name: Copy;
  description: Copy;
  cost?: number;
  revenue?: number;
}

export interface ModernLawSpec {
  slug: string;
  from: 2027 | 2030 | 2035 | 2040 | 2045 | 2050;
  /** First year no new bill may file the law; an enacted one stays in force. */
  until?: number;
  /** Slug of the law that takes over new filing when this one closes. */
  successor?: string;
  category: PoliticalMetricCategoryId;
  /** Winners first (the first entry sets the law's lean), then the payer. */
  targets: Array<{ metricId: PoliticalMetricId; weight: number }>;
  budgetKeyOverride?: Partial<Record<ModernLawCountry, string>>;
  title: Copy;
  description: Copy;
  /** Levels 1 to 4; level 0 is the shared "no statute" rung below. */
  levels: [LevelSpec, LevelSpec, LevelSpec, LevelSpec];
  noStatute: Copy;
}

const pick = (copy: Copy, countryId: ModernLawCountry): string =>
  typeof copy === "string" ? copy : (copy[countryId as keyof typeof copy] ?? copy.US);

/** DE, JP and CN have no pension line of their own, so those laws book to welfare. */
function budgetKeyFor(spec: ModernLawSpec, countryId: ModernLawCountry): string | undefined {
  const own = spec.budgetKeyOverride?.[countryId];
  if (own) return own;
  if (!UK_BUDGET_STYLE.has(countryId)) return undefined;
  const uk = spec.budgetKeyOverride?.UK;
  return uk === "statePensions" ? "welfare" : uk;
}

const EARLIER_BAND_SPECS: readonly ModernLawSpec[] = [
  ...EARLIER_BAND_SPECS_1,
  ...EARLIER_BAND_SPECS_2,
  ...EARLIER_BAND_SPECS_3,
];

/** Array.sort is stable, so each band keeps its authored order within a year. */
export const MODERN_ERA_LAW_SPECS: readonly ModernLawSpec[] = [
  ...EARLIER_BAND_SPECS,
  ...AUTOMATION_BAND_SPECS,
  ...LATE_BAND_SPECS,
].sort((a, b) => a.from - b.from);

function buildLaw(spec: ModernLawSpec, countryId: ModernLawCountry): PoliticalLaw {
  const levels = [
    { name: "No Statute", description: pick(spec.noStatute, countryId) },
    ...spec.levels.map((level): LawLevel => ({
      name: pick(level.name, countryId),
      description: pick(level.description, countryId),
      ...(level.cost !== undefined ? { gdpCostFraction: level.cost } : {}),
      ...(level.revenue !== undefined ? { gdpRevenueFraction: level.revenue } : {}),
    })),
  ] as [LawLevel, LawLevel, LawLevel, LawLevel, LawLevel];
  return {
    id: `${countryId.toLowerCase()}.sec.${spec.slug}`,
    countryId,
    kind: "secondary",
    targets: spec.targets.map((target) => ({ ...target })),
    title: pick(spec.title, countryId),
    description: pick(spec.description, countryId),
    category: spec.category,
    allowedScope: "national",
    baselineLevel: 0,
    window: { from: spec.from, ...(spec.until !== undefined ? { until: spec.until } : {}) },
    levels,
    ...(budgetKeyFor(spec, countryId) ? { budgetKeyOverride: budgetKeyFor(spec, countryId) } : {}),
  };
}

export const US_MODERN_ERA_LAWS: PoliticalLaw[] = MODERN_ERA_LAW_SPECS.map((spec) =>
  buildLaw(spec, "US")
);

export const UK_MODERN_ERA_LAWS: PoliticalLaw[] = MODERN_ERA_LAW_SPECS.map((spec) =>
  buildLaw(spec, "UK")
);

export const DE_MODERN_ERA_LAWS: PoliticalLaw[] = MODERN_ERA_LAW_SPECS.map((spec) =>
  buildLaw(spec, "DE")
);

export const JP_MODERN_ERA_LAWS: PoliticalLaw[] = MODERN_ERA_LAW_SPECS.map((spec) =>
  buildLaw(spec, "JP")
);

export const CN_MODERN_ERA_LAWS: PoliticalLaw[] = MODERN_ERA_LAW_SPECS.map((spec) =>
  buildLaw(spec, "CN")
);

/** First year of the bands that RU and DD also carry. */
export const SHARED_BAND_FROM_YEAR = 2045;

const sharedBand = (country: "RU" | "DD"): PoliticalLaw[] =>
  MODERN_ERA_LAW_SPECS.filter((spec) => spec.from >= SHARED_BAND_FROM_YEAR).map((spec) =>
    buildLaw(spec, country)
  );

export const RU_MODERN_ERA_LAWS: PoliticalLaw[] = sharedBand("RU");

export const DD_MODERN_ERA_LAWS: PoliticalLaw[] = sharedBand("DD");
