/** Operator control for party growth geography; country scoping remains mandatory. */
export function partyAdjacencyEnabled(
  config?: { partyAdjacencyEnabled?: boolean } | null
): boolean {
  return config?.partyAdjacencyEnabled !== false;
}

export function partyGrowthRegions(
  constrained: Iterable<string>,
  countryRegions: readonly string[],
  enabled: boolean
): Set<string> {
  return new Set(enabled ? constrained : countryRegions);
}
