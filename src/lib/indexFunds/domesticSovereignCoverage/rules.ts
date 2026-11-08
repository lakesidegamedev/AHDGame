/** Slug convention shared with BOND_FUND_DEFINITIONS country funds. */
export function domesticSovereignBondFundSlug(countryId: string): string {
  return `${countryId.toLowerCase()}_sovereign_bonds`;
}

export interface DomesticSovereignBondFundSeed {
  slug: string;
  name: string;
  ticker: string;
  scope: "country";
  kind: "bond";
  countryId: string;
  anchorCurrencyCode: string;
  bondUniverse: { issuerType: "sovereign"; homeOnly: true };
}

/**
 * Seed shape for the ensured fund. Scope, kind, and universe are literals:
 * a coverage fund is always a country bond fund that may hold only its own
 * sovereign's paper. Broad/global/unrated-foreign mandates cannot arise here.
 */
export function buildDomesticSovereignBondFundSeed(
  countryId: string,
  anchorCurrencyCode: string
): DomesticSovereignBondFundSeed {
  return {
    slug: domesticSovereignBondFundSlug(countryId),
    name: `${countryId} Government Bond Fund`,
    ticker: `${countryId}GOV`,
    scope: "country",
    kind: "bond",
    countryId,
    anchorCurrencyCode,
    bondUniverse: { issuerType: "sovereign", homeOnly: true },
  };
}

export interface DomesticCoveragePlanInput {
  /** Exact gameConfig gate. Anything but true (absent, false) plans nothing. */
  enabled: boolean;
  /** Registered sovereign countries (dissolved states excluded by the caller). */
  registeredCountryIds: readonly string[];
  /** Countries with a national budget document (rating source exists). */
  budgetedCountryIds: readonly string[];
  /** Countries with at least one live sovereign issue (unmatured, non-defaulted). */
  liveSovereignIssuerCountryIds: readonly string[];
  /** Countries a serviceable fund already calls home (active or backing-paused). */
  coveredHomeCountryIds: readonly string[];
  /** Anchor currency per country; a country without one cannot seed a fund. */
  anchorCurrencyByCountryId: Readonly<Record<string, string>>;
}

/**
 * Countries that still need a domestic sovereign-bond fund, sorted for
 * determinism. Empty unless the gate is exactly true; empty when every
 * issuer is already covered or no issuer is eligible.
 */
export function planDomesticSovereignCoverage(input: DomesticCoveragePlanInput): string[] {
  if (input.enabled !== true) return [];
  const budgeted = new Set(input.budgetedCountryIds);
  const live = new Set(input.liveSovereignIssuerCountryIds);
  const covered = new Set(input.coveredHomeCountryIds);
  const planned = input.registeredCountryIds.filter(
    (countryId) =>
      budgeted.has(countryId) &&
      live.has(countryId) &&
      !covered.has(countryId) &&
      typeof input.anchorCurrencyByCountryId[countryId] === "string" &&
      input.anchorCurrencyByCountryId[countryId]!.length > 0
  );
  return [...new Set(planned)].sort();
}
