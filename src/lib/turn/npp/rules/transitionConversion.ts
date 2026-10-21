/**
 * AI use of the transition package's free conversion (funded-market cutover).
 *
 * One rule, no industry lists: an AI corporation converts at most one losing,
 * over-built sector per turn, into the operating lane whose outputs the market
 * is shortest of in that country, and only when that shortage is real (prices
 * well over base) and stronger than the sector's own lane. Chronic gluts are
 * already handled by mothballing; this moves capacity toward unmet demand.
 * Lanes are ranked net of how scarce their own inputs are: a plant converted
 * into a lane whose input is the shortest good in the country sits idle.
 *
 * Pure: sectors, last results and a price signal in, one choice or null out.
 */
import {
  OPERATING_SECTOR_TYPES,
  operatingSectorIdentity,
  type OperatingSectorType,
} from "@/lib/constants/corporations";
import { getOperatingSectorType } from "@/lib/constants/sectorStrategies";
import { freeTransitionConversion } from "@/lib/market/producerMarket/transitionRules";
import type { CorporateSector } from "@/lib/db/types";

/** Settled turns with no sales after which an AI-run corporation mothballs a plant. */
export const AI_ZERO_SALES_MOTHBALL_TURNS = 2;

/** Price-over-base shortage a target lane must show before an AI converts into it. */
export const AI_CONVERSION_MIN_SHORTAGE = 1.25;

export interface TransitionConversionChoice {
  sectorId: string;
  lane: OperatingSectorType;
}

export function chooseTransitionConversion(input: {
  sectors: readonly CorporateSector[];
  /** Last settled income per sector id; negative means losing. */
  incomeBySectorId: ReadonlyMap<string, number>;
  turn: number;
  firstFundedTurn: number | undefined;
  /** Weighted price-over-base of a lane's outputs in a country (1 = balanced). */
  shortageOf: (lane: OperatingSectorType, countryId: string) => number;
  /**
   * Highest price-over-base among the inputs a lane consumes in a country (1 =
   * balanced). Omitted means inputs are not considered.
   */
  inputPressureOf?: (lane: OperatingSectorType, countryId: string) => number;
  /** Lanes the operator may run; null means any. */
  allowedLanes: ReadonlySet<string> | null;
  /** Sectors already mothballed or being mothballed this turn. */
  excludedSectorIds: ReadonlySet<string>;
}): TransitionConversionChoice | null {
  const lanesInState = new Map<string, Set<string>>();
  for (const s of input.sectors) {
    const lanes = lanesInState.get(s.stateId) ?? new Set<string>();
    lanes.add(getOperatingSectorType(s.sectorType, s.industryModel, s.mediaDiscriminator));
    lanesInState.set(s.stateId, lanes);
  }
  const losing = input.sectors
    .filter(
      (s) =>
        !s.mothballed &&
        !s.transitionFromStrategyId &&
        !input.excludedSectorIds.has(s._id.toString()) &&
        (input.incomeBySectorId.get(s._id.toString()) ?? 0) < 0 &&
        freeTransitionConversion(s, input.turn, input.firstFundedTurn)
    )
    .sort(
      (a, b) =>
        (input.incomeBySectorId.get(a._id.toString()) ?? 0) -
          (input.incomeBySectorId.get(b._id.toString()) ?? 0) ||
        (a._id.toString() < b._id.toString() ? -1 : 1)
    );
  for (const sector of losing) {
    const country = String(sector.countryId ?? "");
    const ownLane = getOperatingSectorType(
      sector.sectorType,
      sector.industryModel,
      sector.mediaDiscriminator
    );
    const taken = lanesInState.get(sector.stateId) ?? new Set<string>();
    // Output shortage discounted by the scarcity of what the lane has to buy.
    const netOf = (lane: OperatingSectorType) => {
      const pressure = input.inputPressureOf?.(lane, country) ?? 1;
      return (
        input.shortageOf(lane, country) / (Number.isFinite(pressure) ? Math.max(1, pressure) : 1)
      );
    };
    let best: { lane: OperatingSectorType; score: number; net: number } | null = null;
    for (const lane of OPERATING_SECTOR_TYPES) {
      // Extraction depends on local deposits the rule cannot see; leave it to players.
      if (lane === ownLane || taken.has(lane)) continue;
      if (operatingSectorIdentity(lane).sectorType === "extraction") continue;
      if (input.allowedLanes && !input.allowedLanes.has(lane)) continue;
      const score = input.shortageOf(lane, country);
      const net = netOf(lane);
      if (Number.isFinite(score) && Number.isFinite(net) && (!best || net > best.net))
        best = { lane, score, net };
    }
    if (best && best.score >= AI_CONVERSION_MIN_SHORTAGE && best.net > netOf(ownLane))
      return { sectorId: sector._id.toString(), lane: best.lane };
  }
  return null;
}

/**
 * The corporation's sectors as they will stand once this decision's conversion
 * applies, so entry evaluation later in the same pass does not found a sector in
 * a state and industry that the conversion has just taken.
 */
export function sectorsAfterConversion<T extends { _id: { toString(): string } }>(
  sectors: T[],
  converted: { sectorId: string; set: Partial<T> } | null
): T[] {
  if (!converted) return sectors;
  return sectors.map((s) =>
    s._id.toString() === converted.sectorId ? { ...s, ...converted.set } : s
  );
}
