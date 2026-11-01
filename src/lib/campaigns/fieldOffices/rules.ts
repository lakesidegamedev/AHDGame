import { getCountryConfig, type CountryId } from "@/lib/constants/countries";

/**
 * Campaign field offices: rules registry.
 *
 * Field offices are part of Campaign Manager, so they exist only in
 * presidential races. A country opts in with `CountryConfig.fieldOfficeScope`.
 * Everything that varies by scope (costs, effect sizes) lives in
 * `SCOPE_RULES`. Adding a country is one config line; adding a scope is one
 * entry here plus a subdivision source in `subdivisions.ts`.
 *
 * Money is anchor-denominated and converted at the frozen campaign basis, the
 * same way Strategic Operations upgrades are priced.
 */

export type FieldOfficeScope = "county";

export interface FieldOfficeScopeRules {
  scope: FieldOfficeScope;
  /** Anchor funds to open one office, before price level. */
  openCostAnchor: number;
  /** Campaign actions to open one office. */
  openActions: number;
  /** Anchor funds per office per turn. */
  upkeepAnchor: number;
  /**
   * Region-wide turnout points each fully ramped office adds before
   * saturation. Every office contributes here.
   */
  regionPerOfficePct: number;
  /** Ceiling on the region-wide term; offices saturate toward it. */
  regionCapPct: number;
  /**
   * Turnout points an office adds inside its own subdivision. Weighted by the
   * subdivision's share of the region electorate and the candidate's yield
   * there, so a big friendly county is worth more than a small hostile one.
   */
  subdivisionPct: number;
}

const SCOPE_RULES: Readonly<Record<FieldOfficeScope, FieldOfficeScopeRules>> = {
  county: {
    scope: "county",
    openCostAnchor: 60_000,
    openActions: 4,
    upkeepAnchor: 6_000,
    regionPerOfficePct: 0.6,
    regionCapPct: 3,
    subdivisionPct: 5,
  },
};

/** Turns for a new office to reach full strength (1/N, 2/N, ... 1). */
export const FIELD_OFFICE_RAMP_TURNS = 3;

/** Most offices one presidential campaign may hold across the country. */
export const FIELD_OFFICE_CAP = 40;

export function getFieldOfficeScope(countryId: string): FieldOfficeScope | null {
  try {
    return getCountryConfig(countryId as CountryId).fieldOfficeScope ?? null;
  } catch {
    return null;
  }
}

export function getFieldOfficeRules(countryId: string): FieldOfficeScopeRules | null {
  const scope = getFieldOfficeScope(countryId);
  return scope ? SCOPE_RULES[scope] : null;
}

/** Anchor open cost and per-turn upkeep for one office. */
export function getFieldOfficeCostAnchor(rules: FieldOfficeScopeRules): {
  open: number;
  upkeep: number;
  actions: number;
} {
  return {
    open: rules.openCostAnchor,
    upkeep: rules.upkeepAnchor,
    actions: rules.openActions,
  };
}
