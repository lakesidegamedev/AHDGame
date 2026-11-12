/**
 * §5.2 category → spending.byCategory key tables, per country. Keys are validated
 * against the deploy preset's seeded budget keys (Task 7 keeps the RU re-authored
 * seed consistent with this table).
 *
 * UK/RU society default is welfare wholesale; pension-flavored laws override via
 * budgetKeyOverride ("statePensions"), authored per-law in the catalog documents.
 */

import type { PoliticalMetricCategoryId } from "../politicalMetrics/types";
import type { CostAnchorCountryId } from "./types";

const BUDGET_KEY_BY_CATEGORY: Record<
  CostAnchorCountryId,
  Record<PoliticalMetricCategoryId, string>
> = {
  US: {
    economy: "other",
    education: "education",
    health: "healthcare",
    infrastructure: "infrastructure",
    order: "other",
    environment: "other",
    society: "socialSecurity",
    governance: "other",
    defense: "defense",
  },
  UK: {
    economy: "other",
    education: "education",
    health: "health",
    infrastructure: "transport",
    order: "other",
    environment: "other",
    society: "welfare",
    governance: "other",
    defense: "defense",
  },
  RU: {
    economy: "other",
    education: "education",
    health: "healthcare",
    infrastructure: "infrastructure",
    order: "other",
    environment: "other",
    society: "welfare",
    governance: "other",
    defense: "defense",
  },
  DD: {
    economy: "other",
    education: "education",
    health: "healthcare",
    infrastructure: "infrastructure",
    order: "other",
    environment: "other",
    society: "welfare",
    governance: "other",
    defense: "defense",
  },
  DE: {
    economy: "other",
    education: "education",
    health: "healthcare",
    infrastructure: "transport",
    order: "other",
    environment: "other",
    society: "welfare",
    governance: "other",
    defense: "defense",
  },
  CA: {
    economy: "other",
    education: "education",
    health: "health",
    infrastructure: "transport",
    order: "other",
    environment: "other",
    society: "welfare",
    governance: "other",
    defense: "defense",
  },
  JP: {
    economy: "other",
    education: "education",
    health: "healthcare",
    infrastructure: "transport",
    order: "other",
    environment: "other",
    society: "welfare",
    governance: "other",
    defense: "defense",
  },
  CN: {
    economy: "other",
    education: "education",
    health: "healthcare",
    infrastructure: "transport",
    order: "other",
    environment: "other",
    society: "welfare",
    governance: "other",
    defense: "defense",
  },
};

/** The effective budget key for a law: per-law override wins over the category table. */
export function budgetKeyForLaw(law: {
  countryId: CostAnchorCountryId;
  category: PoliticalMetricCategoryId;
  budgetKeyOverride?: string;
}): string {
  return law.budgetKeyOverride ?? BUDGET_KEY_BY_CATEGORY[law.countryId][law.category];
}
