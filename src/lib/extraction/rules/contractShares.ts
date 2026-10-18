/**
 * Extraction concessions reserve capacity for a company in a region. Multiple
 * active concessions add together, and all of the company's sectors share that
 * allocation: see indexContractShares.
 */
import type { ExtractableResource } from "@/lib/constants/commodities";

export function indexContractShares(
  contracts: readonly {
    stateId: string;
    corporationId: string;
    resource: ExtractableResource;
    share: number;
  }[]
): Map<string, Map<ExtractableResource, Map<string, number>>> {
  const result = new Map<string, Map<ExtractableResource, Map<string, number>>>();
  for (const contract of contracts) {
    let resources = result.get(contract.stateId);
    if (!resources) result.set(contract.stateId, (resources = new Map()));
    let companies = resources.get(contract.resource);
    if (!companies) resources.set(contract.resource, (companies = new Map()));
    companies.set(
      contract.corporationId,
      (companies.get(contract.corporationId) ?? 0) + contract.share
    );
  }
  return result;
}
