/**
 * Freight visibility estimates use the sourcing pass's TEU per state hop.
 * Sector output is scaled from its observed mix to installed capacity; the
 * result assumes every output unit leaves its state once.
 */
import type { CommodityType } from "@/lib/constants/commodities";
import { FREIGHT_CLASS_BY_COMMODITY, freightTeuPerUnitHop } from "./freightClass";

export type FreightOutputByCommodity = Partial<Record<CommodityType, number>>;

export interface FreightCapacityEstimateSector {
  stateId: string;
  producedUnits?: number | null;
  capacityUnits?: number | null;
  outputByCommodity: FreightOutputByCommodity;
  /** Legacy nameplate output is already a full-capacity basis. */
  nameplateBasis?: boolean;
}

/** TEU estimate if every listed output unit crosses exactly one state line. */
export function estimateOneHopFreightTeu(outputByCommodity: FreightOutputByCommodity): number {
  let estimate = 0;
  for (const [commodity, rawUnits] of Object.entries(outputByCommodity)) {
    const freightClass = FREIGHT_CLASS_BY_COMMODITY[commodity as CommodityType];
    const units = Number(rawUnits);
    if (!freightClass || !Number.isFinite(units) || units <= 0) continue;
    estimate += units * freightTeuPerUnitHop(freightClass);
  }
  return estimate;
}

/** Scale one sector's observed output mix to installed capacity, then one hop. */
export function estimateSectorFullCapacityOneHopFreightTeu(
  sector: FreightCapacityEstimateSector
): number | null {
  const produced = sector.producedUnits;
  const capacity = sector.capacityUnits;
  const estimate = estimateOneHopFreightTeu(sector.outputByCommodity);
  if (sector.nameplateBasis) return estimate;
  if (typeof produced !== "number" || !Number.isFinite(produced)) return null;
  if (produced <= 0) return capacity === 0 ? 0 : null;
  if (typeof capacity !== "number" || !Number.isFinite(capacity)) return null;
  if (capacity < 0) return null;
  return estimate * (capacity / produced);
}

/**
 * Sum corporate sectors at installed capacity and add currently available
 * non-corporate output. `stateOutputByCommodity` is the market's all-source
 * state supply, so its residual after corporate production is the unowned
 * share; all figures remain state-scoped.
 */
export function estimateStateFullCapacityOneHopFreightTeu(args: {
  sectors: readonly FreightCapacityEstimateSector[];
  corporateOutputByState: Readonly<Record<string, FreightOutputByCommodity>>;
  stateOutputByCommodity: Readonly<Record<string, FreightOutputByCommodity>>;
}): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  const stateIds = new Set([
    ...args.sectors.map((sector) => sector.stateId),
    ...Object.keys(args.stateOutputByCommodity),
  ]);

  const corporateEstimateByState = new Map<string, { estimate: number; complete: boolean }>();
  for (const sector of args.sectors) {
    const existing = corporateEstimateByState.get(sector.stateId) ?? {
      estimate: 0,
      complete: true,
    };
    const estimate = estimateSectorFullCapacityOneHopFreightTeu(sector);
    if (estimate == null) existing.complete = false;
    else existing.estimate += estimate;
    corporateEstimateByState.set(sector.stateId, existing);
  }

  for (const stateId of stateIds) {
    const corporate = corporateEstimateByState.get(stateId) ?? { estimate: 0, complete: true };
    const corporateOutput = args.corporateOutputByState[stateId] ?? {};
    const allOutput = args.stateOutputByCommodity[stateId] ?? {};
    const unownedResidual: FreightOutputByCommodity = {};
    for (const commodity of Object.keys(allOutput) as CommodityType[]) {
      unownedResidual[commodity] = Math.max(
        0,
        (allOutput[commodity] ?? 0) - (corporateOutput[commodity] ?? 0)
      );
    }
    result[stateId] = corporate.complete
      ? corporate.estimate + estimateOneHopFreightTeu(unownedResidual)
      : null;
  }
  return result;
}
