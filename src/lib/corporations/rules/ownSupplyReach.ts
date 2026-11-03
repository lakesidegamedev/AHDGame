/**
 * Why a company's own output of an input did not cover one of its plants.
 *
 * The company page nets output against input use across every site, so a
 * company can read a surplus of a commodity its own plant is short of. Own
 * output only reaches a plant when the supply policy puts own plants first,
 * when freight actually hauled it across states (freight-class goods), and
 * only for demand no supply agreement has already claimed. This names which
 * of those stood in the way, from last turn's records.
 *
 * Pure: plain data in, reasons out.
 */

export type OwnSupplyPriority = "market" | "own" | "group";

export type OwnSupplyReachReason =
  /** The policy sells own output on the market before own plants see it. */
  | "market_priority"
  /** Made only in other states, and no own haul reached this state last turn. */
  | "no_route"
  /** Agreements claim part of this demand; own supply does not fill that part. */
  | "agreement_reserved"
  /** Own supply did reach this plant's state; it was not enough. */
  | "not_enough";

export interface OwnSupplyReach {
  /** States where the company's other sites made the commodity last turn. */
  sourceStateIds: string[];
  reasons: OwnSupplyReachReason[];
}

export function ownSupplyReach(args: {
  priority: OwnSupplyPriority;
  buyerStateId: string;
  /** States where the company's other sites made this commodity last turn. */
  sourceStateIds: readonly string[];
  /** Freight-class goods only cross states along hauls freight actually made. */
  crossesStatesByFreight: boolean;
  /**
   * The haul record is from last turn. A stale record says nothing about last
   * turn, so a missing haul is never claimed from it.
   */
  routesFresh: boolean;
  /** Own-route units hauled into the buyer's state last turn, all origins. */
  routedUnitsIn: number;
  /** An agreement held part of this demand and delivered short (see agreementLeftAGap). */
  hasAgreement: boolean;
}): OwnSupplyReach | null {
  const sourceStateIds = [...new Set(args.sourceStateIds)].sort();
  if (sourceStateIds.length === 0) return null;
  if (args.priority === "market") return { sourceStateIds, reasons: ["market_priority"] };
  const reasons: OwnSupplyReachReason[] = [];
  const madeHere = sourceStateIds.includes(args.buyerStateId);
  const routed = Number.isFinite(args.routedUnitsIn) && args.routedUnitsIn > 0;
  if (args.crossesStatesByFreight && args.routesFresh && !madeHere && !routed)
    reasons.push("no_route");
  if (args.hasAgreement) reasons.push("agreement_reserved");
  if (reasons.length === 0) reasons.push("not_enough");
  return { sourceStateIds, reasons };
}

/** A turn-stamped record describes last turn when it is this turn or the one before. */
export function isLastTurnRecord(turn: number | null | undefined, currentTurn: number): boolean {
  return typeof turn === "number" && Number.isFinite(turn) && turn >= currentTurn - 1;
}

/**
 * Whether a supply agreement held part of this plant's demand and left a gap
 * last turn. The engine claims agreement demand before own supply
 * (internalSupply.ts): any positive cap, corporation-wide, except for a
 * state-scoped good, which only reserves in the agreement's own state. A claim
 * delivered in full left nothing for own supply to fill, so only a short
 * delivery on last turn's record counts.
 */
export function agreementLeftAGap(args: {
  volumeCap: number;
  /** The agreement's state, for a state-scoped good. */
  agreementStateId?: string | null;
  stateScoped: boolean;
  buyerStateId: string;
  lastDeliveryTurn?: number | null;
  lastDeliveredUnits?: number | null;
  currentTurn: number;
}): boolean {
  if (!(Number.isFinite(args.volumeCap) && args.volumeCap > 0)) return false;
  if (args.stateScoped && args.agreementStateId && args.agreementStateId !== args.buyerStateId)
    return false;
  if (!isLastTurnRecord(args.lastDeliveryTurn, args.currentTurn)) return false;
  const delivered =
    typeof args.lastDeliveredUnits === "number" && Number.isFinite(args.lastDeliveredUnits)
      ? args.lastDeliveredUnits
      : 0;
  return delivered < args.volumeCap * (1 - 1e-9);
}
