import type { SupplyChainFilters, SupplyChainFlow, SupplyChainRow } from "../types";

export function supplyChainRows(
  flows: readonly SupplyChainFlow[],
  filters: SupplyChainFilters
): SupplyChainRow[] {
  const groups = new Map<string, SupplyChainRow>();
  for (const flow of flows) {
    if (
      (filters.country && flow.site.countryId !== filters.country) ||
      (filters.state && flow.site.stateId !== filters.state) ||
      (filters.type && flow.site.sectorType !== filters.type) ||
      (filters.sector && flow.site.id !== filters.sector) ||
      (filters.mode && flow.mode !== filters.mode)
    )
      continue;
    const key = JSON.stringify([
      flow.direction,
      filters.view === "sites" ? flow.site.id : null,
      flow.counterpartyId,
      flow.counterpartyCountry,
      flow.counterpartyState,
      flow.commodity,
      flow.mode,
    ]);
    const row = groups.get(key) ?? {
      ...flow,
      key,
      site: filters.view === "sites" ? flow.site : null,
      units: 0,
      amount: 0,
    };
    row.units += flow.units;
    row.amount += flow.amount;
    groups.set(key, row);
  }
  return [...groups.values()].sort(
    (a, b) => b.amount - a.amount || b.units - a.units || a.key.localeCompare(b.key)
  );
}
