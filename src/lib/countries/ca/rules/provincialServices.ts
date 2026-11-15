import type { StateBudget } from "@/lib/db/types/budget";
import type { RegionalProgramClaim } from "@/lib/governmentFinance/rules/regionalSettlement";
import { CA_PROVINCIAL_SERVICES_2027 } from "../data/provincialServices2027";

const SHARES = {
  education: 0.35,
  healthcare: 0.25,
  transportation: 0.15,
  publicSafety: 0.12,
  other: 0.13,
};

export function usesCaProvincialFinance(
  country: string,
  preset: string | null | undefined
): boolean {
  return country === "CA" && preset === "2027-default";
}

/** The modeled provincial transfer appropriation uses the opening GDP share. */
export function caProvincialGrantDistribution(
  country: string,
  preset: string | null | undefined,
  regions: readonly { id: string; gdp: number }[]
): Record<string, number> {
  if (!usesCaProvincialFinance(country, preset)) return {};
  return Object.fromEntries(regions.map((region) => [region.id, region.gdp * 1_000_000 * 0.012]));
}

/** Standing services survive an empty local law book; funding still constrains delivery. */
export function caProvincialServiceClaims(
  country: string,
  preset: string | null | undefined,
  region: string
): Array<RegionalProgramClaim & { category: string }> {
  if (!usesCaProvincialFinance(country, preset)) return [];
  const total = CA_PROVINCIAL_SERVICES_2027[region];
  if (total === undefined)
    throw new Error(`Missing Canadian provincial service baseline: ${region}`);
  return Object.entries(SHARES).map(([category, share]) => ({
    category,
    programId: `opening-services:CA:${region}:${category}`,
    legislationTypeId: `opening-services:${category}`,
    policyOptionId: "opening",
    authorizedCost: Math.round(total * share),
    obligationPriority: 5,
    fundingSemantics: "appropriation_included",
    continuing: true,
  }));
}

export function withCaProvincialServices(budget: StateBudget, preset: string): StateBudget {
  const claims = caProvincialServiceClaims(budget.countryId ?? "", preset, budget.stateId);
  if (!claims.length) return budget;
  const spending = {
    byCategory: Object.fromEntries(claims.map((c) => [c.category, c.authorizedCost])),
    total: claims.reduce((sum, c) => sum + c.authorizedCost, 0),
  };
  return {
    ...budget,
    spending,
    authorizedSpending: spending,
    surplus: budget.revenue.total - spending.total,
  };
}
