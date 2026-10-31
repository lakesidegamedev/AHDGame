/**
 * Which countries get country-owned corporations on a reseed, and how.
 *
 * Bootstrap creates these corporations inside the budget seeders, which also
 * write budgets and enacted laws the economy-only reset keeps. So the reset
 * calls the same generator per country instead, and this table reproduces the
 * gating each budget seeder applies: which presets it runs on, whether it
 * needs an authored national budget, and whether it passes the command
 * economy flag through to the generator.
 */

export type CountryCorporationMode =
  /** generateCountryOwnedSeedData filtered to the country. */
  | "generator"
  /** The 2019 Russian sovereign issuer only, renamed (seedModernBudgets2019). */
  | "modernRuIssuer"
  /**
   * A federation whose dissolution settlement has applied: its sovereign
   * issuer only, with no production. The command conglomerate it owned before
   * the breakup is never rebuilt.
   */
  | "successorIssuer";

export interface CountryCorporationSeed {
  countryId: string;
  mode: CountryCorporationMode;
  /** Pass gameConfig.commandEconomyEnabled to the generator; otherwise false. */
  commandAware: boolean;
}

/** seedBudgets, seedUkBudgets, seedJpBudgets and seedCountryBudgets without a skip. */
const ALWAYS_SEEDED = ["US", "UK", "JP", "DE", "BR", "IE", "NG"] as const;
/** seedCountryBudgets with skipWithoutNationalBudget. */
const SEEDED_WITH_NATIONAL_BUDGET = ["FR", "IT", "ES", "SE", "TR", "GR", "AT", "FI"] as const;
/** seedEasternBlocBudget, Cold War eras only, with an authored national budget. */
const EASTERN_BLOC = ["HU", "PL", "RO", "YU", "BG", "CS", "UKR", "BLR", "BAL"] as const;

export function countryCorporationSeeds(input: {
  preset: string;
  /** Countries with an authored national budget for the preset. */
  nationalBudgetCountries: readonly string[];
  easternBlocEra: boolean;
  /**
   * Source entities of applied federation settlements in the live world. The
   * reset rebuilds what the world is now, not what the preset started with.
   */
  dissolvedFederations?: readonly string[];
}): CountryCorporationSeed[] {
  const budgets = new Set(input.nationalBudgetCountries);
  const dissolved = new Set(input.dissolvedFederations ?? []);
  const seeds: CountryCorporationSeed[] = [];
  for (const countryId of ALWAYS_SEEDED)
    seeds.push({ countryId, mode: "generator", commandAware: false });
  // seedCnBudgets always runs and passes the flag.
  seeds.push({ countryId: "CN", mode: "generator", commandAware: true });
  for (const countryId of SEEDED_WITH_NATIONAL_BUDGET)
    if (budgets.has(countryId)) seeds.push({ countryId, mode: "generator", commandAware: false });
  if (budgets.has("DD")) seeds.push({ countryId: "DD", mode: "generator", commandAware: true });
  if (input.preset === "2019-default")
    seeds.push({ countryId: "RU", mode: "modernRuIssuer", commandAware: false });
  else if (input.preset === "1991-default" || budgets.has("RU"))
    // 1991: seedSuccessorBudgets1991; other eras: seedRuBudgets.
    seeds.push({ countryId: "RU", mode: "generator", commandAware: true });
  if (input.easternBlocEra)
    for (const countryId of EASTERN_BLOC)
      if (budgets.has(countryId)) seeds.push({ countryId, mode: "generator", commandAware: true });
  // A dissolved federation keeps only its issuer identity, never command assets.
  const resolved = seeds.map((seed) =>
    dissolved.has(seed.countryId)
      ? { countryId: seed.countryId, mode: "successorIssuer" as const, commandAware: false }
      : seed
  );
  return resolved.sort((a, b) => a.countryId.localeCompare(b.countryId));
}
