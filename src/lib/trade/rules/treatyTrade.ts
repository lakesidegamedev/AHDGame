/**
 * Trade terms of the post-2027 treaties. A treaty with terms in force makes trade between
 * two members of it easier on the commodities it names: a higher route affinity (more of the
 * surplus finds its way to the partner) and a lower landed cost (a tariff waiver in effect).
 * Trade with non-members is untouched.
 *
 * Pure: plain data in, plain data out. The shell supplies which treaties have terms in force.
 */
import type { CommodityType } from "@/lib/constants/commodities";

export interface TreatyTradeTerms {
  commodities: readonly CommodityType[];
  /** Multiplies route affinity between two members. */
  affinityMultiplier: number;
  /** Multiplies the landed cost of a member's import from another member. */
  importCostMultiplier: number;
}

export const TREATY_TRADE_TERMS: Readonly<Record<string, TreatyTradeTerms>> = {
  CRITICAL_MINERALS_CLUB: {
    commodities: ["rare_earth", "iron", "coal"],
    affinityMultiplier: 1.5,
    importCostMultiplier: 0.95,
  },
  ARCTIC_AGREEMENT: {
    commodities: ["oil", "natural_gas", "freight"],
    affinityMultiplier: 1.25,
    importCostMultiplier: 0.97,
  },
};

/** Treaties with trade terms, in a stable order. */
export const TREATY_TRADE_ORG_IDS: readonly string[] = Object.keys(TREATY_TRADE_TERMS).sort();

/** Directive keys that carry each treaty's terms. */
export const TREATY_TRADE_DIRECTIVE_KEYS: Readonly<Record<string, string>> = {
  critical_minerals_terms: "CRITICAL_MINERALS_CLUB",
  arctic_terms: "ARCTIC_AGREEMENT",
};

function sharedActiveTreaties(
  exporterOrgs: ReadonlySet<string> | undefined,
  importerOrgs: ReadonlySet<string> | undefined,
  activeTreaties: ReadonlySet<string> | undefined
): string[] {
  if (!exporterOrgs || !importerOrgs || !activeTreaties || activeTreaties.size === 0) return [];
  return TREATY_TRADE_ORG_IDS.filter(
    (org) => activeTreaties.has(org) && exporterOrgs.has(org) && importerOrgs.has(org)
  );
}

/** Route affinity multiplier from treaties both countries belong to; 1 when none applies. */
export function treatyAffinityMultiplier(
  commodity: CommodityType,
  exporterOrgs: ReadonlySet<string> | undefined,
  importerOrgs: ReadonlySet<string> | undefined,
  activeTreaties: ReadonlySet<string> | undefined
): number {
  let multiplier = 1;
  for (const org of sharedActiveTreaties(exporterOrgs, importerOrgs, activeTreaties)) {
    const terms = TREATY_TRADE_TERMS[org];
    if (terms.commodities.includes(commodity)) multiplier *= terms.affinityMultiplier;
  }
  return multiplier;
}

/** Landed cost multiplier from treaties both countries belong to; 1 when none applies. */
export function treatyImportCostMultiplier(
  commodity: CommodityType,
  exporterOrgs: ReadonlySet<string> | undefined,
  importerOrgs: ReadonlySet<string> | undefined,
  activeTreaties: ReadonlySet<string> | undefined
): number {
  let multiplier = 1;
  for (const org of sharedActiveTreaties(exporterOrgs, importerOrgs, activeTreaties)) {
    const terms = TREATY_TRADE_TERMS[org];
    if (terms.commodities.includes(commodity)) multiplier *= terms.importCostMultiplier;
  }
  return multiplier;
}
