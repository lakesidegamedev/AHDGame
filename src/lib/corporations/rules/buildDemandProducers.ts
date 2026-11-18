/** Convert current sector capacity into comparable output for build advice. */
import type { Corporation, CorporateSector } from "@/lib/db/types";
import { getEffectiveStrategyRates } from "@/lib/constants/sectorStrategies";
import { getSectorTechEffects, type LegacyTechContext } from "@/lib/constants/techTree";
import type { CommodityType } from "@/lib/constants/commodities";
import { deliveredFraction } from "../buildDelivery";
import { productionProductivityMultiplier } from "./productionProductivity";

export function buildAdviceOutputMultiplier(input: {
  sector: Pick<
    CorporateSector,
    "sectorType" | "strategyId" | "transitionFromStrategyId" | "transitionStartTurn"
  >;
  supply: Partial<Record<CommodityType, number>>;
  owner?: Corporation;
  techEnabled: boolean;
  /** Era context: how pre-start-decade tech counts. */
  legacyTech: LegacyTechContext;
  turn: number;
  preset: string;
}) {
  const { sector, owner } = input;
  if (input.techEnabled && !owner) return NaN;
  return productionProductivityMultiplier({
    sector,
    supply: input.supply,
    outputRateMult:
      input.techEnabled && owner
        ? getSectorTechEffects(owner, sector.sectorType, input.legacyTech).outputRateMult
        : undefined,
    currentTurn: input.turn,
    preset: input.preset,
  });
}

export function buildDemandProducer(input: {
  sector: CorporateSector;
  owner?: Corporation;
  countryId?: string;
  techEnabled: boolean;
  legacyTech: LegacyTechContext;
  turn: number;
  preset: string;
  hardwareInputReliefStartTurn?: number;
}) {
  const { sector, turn } = input;
  const supply = getEffectiveStrategyRates(
    sector.sectorType,
    sector.strategyId ?? "standard",
    sector.transitionFromStrategyId,
    sector.transitionStartTurn,
    turn,
    input.preset,
    input.hardwareInputReliefStartTurn
  ).supply;
  const multiplier = buildAdviceOutputMultiplier({ ...input, supply });
  const capacity = sector.operatingCapacityUnits ?? sector.capitalStock ?? NaN;
  return {
    stateId: sector.stateId,
    countryId: input.countryId ?? sector.countryId,
    supply,
    capacity: capacity * multiplier,
    produced: sector.producedUnits ?? (capacity === 0 ? 0 : undefined),
    queued:
      (sector.buildQueue ?? []).reduce(
        (sum, order) => sum + order.unitsOrdered * (1 - deliveredFraction(order, turn)),
        0
      ) * multiplier,
  };
}
