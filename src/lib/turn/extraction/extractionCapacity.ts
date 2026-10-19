/**
 * Extraction rights reserve a company's combined concessions before sharing the
 * remaining capacity among open-access operators. All of a company's sectors
 * share its allocation: see computeExtractionCapacityMultipliers.
 */
import type { ExtractableResource } from "@/lib/constants/commodities";
import { EXTRACTABLE_RESOURCES } from "@/lib/constants/commodities";
import type { StateResourceCapacity } from "@/lib/db/types/stateResourceCapacity";
import type { ExtractionContract } from "@/lib/db/types/extractionContract";
import { indexContractShares } from "@/lib/extraction/rules/contractShares";
import type { ObjectId } from "mongodb";

export interface ExtractionSectorInput {
  sectorId: string;
  stateId: string;
  corporationId: ObjectId;
  /**
   * Unconstrained revenue-based output per resource, in units on the DAILY basis
   * (derived from `sector.revenue`, which is daily). Not per game turn — see
   * StateResourceCapacity for the same note.
   */
  revenueBasedOutput: Partial<Record<ExtractableResource, number>>;
  /**
   * Plants only: what the sector actually digs of each resource, same units as
   * revenueBasedOutput. The deposit is shared by min(revenueBasedOutput, cap)
   * and the multiplier is the fraction of THAT desire granted. Absent or
   * non-finite: uncapped.
   */
  plantOutputCap?: Partial<Record<ExtractableResource, number>>;
}

function desiredOutput(sector: ExtractionSectorInput, resource: ExtractableResource): number {
  const output = sector.revenueBasedOutput[resource] ?? 0;
  const cap = sector.plantOutputCap?.[resource];
  return typeof cap === "number" && Number.isFinite(cap)
    ? Math.min(output, Math.max(0, cap))
    : output;
}

/**
 * Compute capacity multipliers (0.0–1.0) per sector per resource.
 *
 * Contract-holders are capped to their allocated share of state capacity.
 * Non-contracted (open-access) sectors share the remaining pool proportionally.
 * States with no capacity document are uncapped (multiplier = 1).
 */
export function computeExtractionCapacityMultipliers(
  sectors: ExtractionSectorInput[],
  contracts: ExtractionContract[],
  capacities: StateResourceCapacity[]
): Map<string, Partial<Record<ExtractableResource, number>>> {
  const result = new Map<string, Partial<Record<ExtractableResource, number>>>();

  const capacityByState = new Map<string, StateResourceCapacity>();
  for (const cap of capacities) {
    capacityByState.set(cap.stateId, cap);
  }

  const contractIndex = indexContractShares(
    contracts.map((contract) => ({
      stateId: contract.stateId,
      corporationId: contract.corporationId.toString(),
      resource: contract.resource,
      share: contract.share,
    }))
  );

  const sectorsByState = new Map<string, ExtractionSectorInput[]>();
  for (const sector of sectors) {
    if (!sectorsByState.has(sector.stateId)) sectorsByState.set(sector.stateId, []);
    sectorsByState.get(sector.stateId)!.push(sector);
  }

  for (const [stateId, stateSectors] of sectorsByState) {
    const capDoc = capacityByState.get(stateId);

    if (!capDoc) {
      for (const sector of stateSectors) {
        result.set(sector.sectorId, buildOnesMap(sector.revenueBasedOutput));
      }
      continue;
    }

    const contractsByResource = contractIndex.get(stateId);

    for (const resource of EXTRACTABLE_RESOURCES) {
      const totalCapacity = capDoc.resources[resource] ?? 0;

      if (totalCapacity <= 0) {
        for (const sector of stateSectors) {
          setMultiplier(result, sector.sectorId, resource, 0);
        }
        continue;
      }

      const contractsForResource = contractsByResource?.get(resource);
      const contractedShareSum = contractsForResource
        ? [...contractsForResource.values()].reduce((a, b) => a + b, 0)
        : 0;
      const openAccessPool = Math.max(0, totalCapacity * (1 - contractedShareSum));

      const contractedByCorporation = new Map<string, ExtractionSectorInput[]>();
      const openAccess: ExtractionSectorInput[] = [];
      for (const sector of stateSectors) {
        const corporationId = sector.corporationId.toString();
        const hasContract = contractsForResource?.has(corporationId) ?? false;
        if (!hasContract) {
          openAccess.push(sector);
          continue;
        }
        const corporationSectors = contractedByCorporation.get(corporationId) ?? [];
        corporationSectors.push(sector);
        contractedByCorporation.set(corporationId, corporationSectors);
      }

      // A contract belongs to the corporation, not to each of its sectors.
      // Price the corporation's combined demand against its one allocation so
      // opening another sector cannot duplicate the same extraction rights.
      //
      // A lease is a reserved floor, not a ceiling: whatever a holder wants
      // beyond its reserved share competes for the open-access pool on the same
      // terms as everyone else. Before ticket 1619 a holder was shut out of the
      // pool entirely, so buying a 10% lease on a deposit the company was
      // already mining alone cut its dig to 10% of the deposit.
      const reservedByCorporation = new Map<string, { allocated: number; desired: number }>();
      for (const [corporationId, corporationSectors] of contractedByCorporation) {
        const share = contractsForResource!.get(corporationId)!;
        const desired = corporationSectors.reduce(
          (sum, sector) => sum + desiredOutput(sector, resource),
          0
        );
        reservedByCorporation.set(corporationId, {
          allocated: Math.min(desired, totalCapacity * share),
          desired,
        });
      }
      const residualOf = (sector: ExtractionSectorInput): number => {
        const output = desiredOutput(sector, resource);
        const reserved = reservedByCorporation.get(sector.corporationId.toString());
        if (!reserved) return output;
        if (!(reserved.desired > 0)) return 0;
        return output * (1 - reserved.allocated / reserved.desired);
      };
      const totalOADemand = stateSectors.reduce((sum, s) => sum + residualOf(s), 0);
      const poolFill =
        openAccessPool <= 0 || totalOADemand <= 0 ? 0 : Math.min(1, openAccessPool / totalOADemand);

      for (const sector of stateSectors) {
        const output = desiredOutput(sector, resource);
        const reserved = reservedByCorporation.get(sector.corporationId.toString());
        if (output <= 0) {
          setMultiplier(
            result,
            sector.sectorId,
            resource,
            openAccessPool <= 0 && !reserved ? 0 : 1
          );
          continue;
        }
        const reservedUnits =
          reserved && reserved.desired > 0 ? output * (reserved.allocated / reserved.desired) : 0;
        const poolUnits = residualOf(sector) * poolFill;
        setMultiplier(
          result,
          sector.sectorId,
          resource,
          Math.min(1, (reservedUnits + poolUnits) / output)
        );
      }
    }
  }

  return result;
}

/**
 * Plants corp phase (#4503): re-express multipliers computed against capped
 * desire as the fraction of each sector's FULL revenueBasedOutput granted. The
 * plants hard-min reads utilization over full output and divides by the active
 * fraction, so a bound mine then digs exactly its grant. An unbound resource
 * stays 1; sectors without a cap are returned unchanged.
 */
export function fullOutputMultipliers(
  sectors: ExtractionSectorInput[],
  multipliers: Map<string, Partial<Record<ExtractableResource, number>>>
): Map<string, Partial<Record<ExtractableResource, number>>> {
  const result = new Map(multipliers);
  for (const sector of sectors) {
    const mults = multipliers.get(sector.sectorId);
    if (!sector.plantOutputCap || !mults) continue;
    const full: Partial<Record<ExtractableResource, number>> = { ...mults };
    for (const [resource, mult] of Object.entries(mults) as [ExtractableResource, number][]) {
      const output = sector.revenueBasedOutput[resource] ?? 0;
      if (mult < 1 && output > 0)
        full[resource] = (mult * desiredOutput(sector, resource)) / output;
    }
    result.set(sector.sectorId, full);
  }
  return result;
}

function setMultiplier(
  map: Map<string, Partial<Record<ExtractableResource, number>>>,
  sectorId: string,
  resource: ExtractableResource,
  multiplier: number
): void {
  if (!map.has(sectorId)) map.set(sectorId, {});
  map.get(sectorId)![resource] = multiplier;
}

function buildOnesMap(
  output: Partial<Record<ExtractableResource, number>>
): Partial<Record<ExtractableResource, number>> {
  const result: Partial<Record<ExtractableResource, number>> = {};
  for (const resource of Object.keys(output) as ExtractableResource[]) {
    result[resource] = 1;
  }
  return result;
}
