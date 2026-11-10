/** Convert current sector capacity into comparable output for build advice. */
import type { Corporation, CorporateSector } from "@/lib/db/types";
import {
  getEffectiveStrategyRatesForOperatingModel,
  getOperatingSectorType,
} from "@/lib/constants/sectorStrategies";
import { getSectorTechEffects } from "@/lib/constants/techTree";
import type { CommodityType } from "@/lib/constants/commodities";
import { deliveredFraction } from "../buildDelivery";
import { productionProductivityMultiplier } from "./productionProductivity";

export function buildAdviceOutputMultiplier(input: {
  sector: Pick<CorporateSector, "sectorType" | "industryModel" | "mediaDiscriminator">;
  supply: Partial<Record<CommodityType, number>>;
  owner?: Corporation;
  techEnabled: boolean;
  turn: number;
  preset: string;
}) {
  const { sector, owner } = input;
  if (input.techEnabled && !owner) return NaN;
  return productionProductivityMultiplier({
    sectorType: sector.sectorType,
    supply: input.supply,
    outputRateMult:
      input.techEnabled && owner
        ? getSectorTechEffects(
            owner,
            getOperatingSectorType(
              sector.sectorType,
              sector.industryModel,
              sector.mediaDiscriminator
            ),
            sector.industryModel,
            sector.mediaDiscriminator
          ).outputRateMult
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
  turn: number;
  preset: string;
  hardwareInputReliefStartTurn?: number;
}) {
  const { sector, turn } = input;
  const supply = getEffectiveStrategyRatesForOperatingModel(
    sector.sectorType,
    sector.strategyId ?? "standard",
    sector.transitionFromStrategyId,
    sector.transitionStartTurn,
    turn,
    sector.industryModel,
    sector.mediaDiscriminator,
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
