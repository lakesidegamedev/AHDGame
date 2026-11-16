/**
 * Government contract bidding uses sealed corporate bids until the closing turn.
 * tenderTab and canBid enforce turn deadlines; compareBids orders fixed-term bids
 * by price without choosing a winner for the government.
 */
import type { ContractBid, GovernmentTender, TenderTab } from "./types";
import { defenceSupplierCapShare } from "@/lib/military/defenceContractLimits";

export const BIDDING_TURNS_MIN = 6;
export const BIDDING_TURNS_MAX = 48;
export const BIDDING_TURNS_DEFAULT = 24;
export const AWARD_WINDOW_TURNS = 24;

export function tenderDeadlines(turn: number, biddingTurns = BIDDING_TURNS_DEFAULT) {
  const closesTurn = turn + biddingTurns;
  return { closesTurn, awardDeadlineTurn: closesTurn + AWARD_WINDOW_TURNS };
}

export const CONTRACTS_PAGE_SIZE = 10;
export function visibleBidHistory(
  history: ContractBid[],
  closesTurn: number,
  turn: number,
  userId?: string,
  ownedCorporationIds?: ReadonlySet<string>
): ContractBid[] {
  return history.filter(
    (b) =>
      turn >= closesTurn ||
      (ownedCorporationIds ? ownedCorporationIds.has(b.corporationId) : b.userId === userId)
  );
}

/** Maximum funding held by an untargeted defence tender; concessions hold capacity instead. */
export function tenderReservationValue(terms: import("./types").TenderTerms): number | null {
  const value = terms.type === "defence" ? terms.lots * terms.maximumPricePerLot : 0;
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
export function validContractCopy(copy: string): boolean {
  return !/[\u2013\u2014]/u.test(copy);
}
export function extractionBidError(input: {
  corporationType: string;
  hasOperations: boolean;
  amount: number;
  minimum: number;
}): string | null {
  if (
    ![input.amount, input.minimum].every(Number.isFinite) ||
    input.amount < 0 ||
    input.minimum < 0
  )
    return "The signing fee must be a valid nonnegative amount.";
  if (input.corporationType !== "extraction")
    return "Only extraction corporations may bid on this concession.";
  if (!input.hasOperations) return "The corporation must operate in this state.";
  if (input.amount < input.minimum) return "The signing fee is below this tender's minimum.";
  return null;
}
export function defenceBidError(input: {
  supplierGrade: number;
  eraGrade?: number;
  requiredGrade: number;
  amount: number;
  maximum: number;
  floor: number | null;
  ceiling: number | null;
  supplierRemainingLots: number;
  supplierRemainingAmount: number;
  lots: number;
}): string | null {
  if (
    ![
      input.supplierGrade,
      input.eraGrade ?? 3,
      input.requiredGrade,
      input.amount,
      input.maximum,
      input.floor,
      input.ceiling,
      input.supplierRemainingLots,
      input.supplierRemainingAmount,
      input.lots,
    ].every((v) => typeof v === "number" && Number.isFinite(v)) ||
    input.amount <= 0 ||
    input.lots <= 0 ||
    input.supplierRemainingAmount < 0
  )
    return "The procurement values must be finite and valid.";
  if (Math.min(input.supplierGrade, input.eraGrade ?? 3) < input.requiredGrade)
    return "The plant cannot supply the required equipment grade.";
  // Empty intersection: every amount in the plant band exceeds the listed maximum.
  if (input.floor != null && input.ceiling != null && input.floor > input.maximum)
    return "Current plant costs sit above this tender's maximum, so no bid amount can fit both the price band and the listed maximum.";
  if (input.floor == null || input.ceiling == null)
    return "The bid must fit the current permitted price band and this tender's maximum.";
  if (input.amount < input.floor) return "The bid is below the current permitted price band.";
  if (input.amount > input.ceiling) return "The bid is above the current permitted price band.";
  if (input.amount > input.maximum) return "The bid is above this tender's maximum.";
  if (input.supplierRemainingLots < input.lots)
    return defenceConcentrationRefusal({
      supplierRemainingLots: input.supplierRemainingLots,
      supplierRemainingAmount: input.supplierRemainingAmount,
      lots: input.lots,
      amount: input.amount,
    });
  return null;
}

function lotWord(count: number): string {
  return count === 1 ? "lot" : "lots";
}

/**
 * Explain a quarterly concentration refusal with the numbers the supplier can act on:
 * how many lots still fit at the bid price, and the highest price per lot that fits
 * the requested lots. Pure: callers pass the already computed remaining allowance.
 */
export function defenceConcentrationRefusal(input: {
  supplierRemainingLots: number;
  supplierRemainingAmount: number;
  lots: number;
  amount: number;
}): string {
  const fittingPrice = Math.floor(input.supplierRemainingAmount / input.lots);
  const room = `only ${input.supplierRemainingLots} ${lotWord(input.supplierRemainingLots)} fit at the bid price of ${input.amount} per lot`;
  if (fittingPrice >= 1)
    return (
      "The supplier cannot take this order within its quarterly concentration limit: " +
      `${room}, but the highest price per lot that fits all ${input.lots} ${lotWord(input.lots)} is ${fittingPrice} per lot.`
    );
  return (
    "The supplier cannot take this order within its quarterly concentration limit: " +
    `${room}, and no price per lot fits all ${input.lots} ${lotWord(input.lots)} within the remaining allowance.`
  );
}

/**
 * Reject a defence tender no supplier could deliver even at the cheapest permitted bid.
 * A tender is deliverable when the floor price times lots fits within the largest share
 * any eligible supplier class may take: the full tranche when state-owned suppliers can
 * bid in the country, otherwise the private one third share. Pure: the caller supplies
 * the floor price, the tranche notional, and which supplier classes are eligible.
 */
export function defenceTenderDeliverabilityError(input: {
  lots: number;
  floorPricePerLot: number;
  procurementNotional: number;
  stateOwnedEligible: boolean;
}): string | null {
  const { lots, floorPricePerLot, procurementNotional } = input;
  if (
    ![lots, floorPricePerLot, procurementNotional].every(
      (v) => typeof v === "number" && Number.isFinite(v)
    ) ||
    !Number.isInteger(lots) ||
    lots <= 0 ||
    !(floorPricePerLot > 0) ||
    !(procurementNotional >= 0)
  )
    return "The tender size cannot be checked against the quarterly contracting tranche.";
  const maxLots = Math.floor(
    (procurementNotional * defenceSupplierCapShare(input.stateOwnedEligible)) / floorPricePerLot
  );
  if (lots <= maxLots) return null;
  const head =
    "No supplier could deliver this tender within the quarterly concentration limit: " +
    `at the floor price of ${floorPricePerLot} per lot, `;
  if (maxLots <= 0) return head + "a supplier's quarterly share fits no lots at this floor price.";
  return (
    head + `at most ${maxLots} ${lotWord(maxLots)} fit. Reduce the lots to ${maxLots} or fewer.`
  );
}

export function tenderTab(
  tender: Pick<GovernmentTender, "status" | "closesTurn" | "awardDeadlineTurn">,
  turn: number
): TenderTab {
  if (tender.status === "awarded") return "awarded";
  if (tender.status === "canceled") return "canceled";
  if (tender.status !== "awarding" && turn >= tender.awardDeadlineTurn) return "canceled";
  return turn < tender.closesTurn && tender.status !== "awarding" ? "active" : "closed";
}
export function canBid(
  tender: Pick<GovernmentTender, "status" | "closesTurn" | "awardDeadlineTurn">,
  turn: number
): boolean {
  return tender.status === "open" && tenderTab(tender, turn) === "active";
}
export function canAward(
  tender: Pick<GovernmentTender, "status" | "closesTurn" | "awardDeadlineTurn">,
  turn: number
): boolean {
  return tender.status === "open" && turn >= tender.closesTurn && turn < tender.awardDeadlineTurn;
}
export function visibleBids(
  tender: Pick<GovernmentTender, "bids" | "closesTurn">,
  turn: number,
  userId?: string,
  ownedCorporationIds?: ReadonlySet<string>
): ContractBid[] {
  return Object.values(tender.bids).filter(
    (b) =>
      (ownedCorporationIds ? ownedCorporationIds.has(b.corporationId) : b.userId === userId) ||
      (!b.withdrawn && turn >= tender.closesTurn)
  );
}
export function compareBids(
  type: "defence" | "extraction",
  left: ContractBid,
  right: ContractBid
): number {
  return (
    (type === "defence" ? left.amount - right.amount : right.amount - left.amount) ||
    left.submittedTurn - right.submittedTurn ||
    left.corporationId.localeCompare(right.corporationId)
  );
}
export function validDeadlines(
  turn: number,
  closesTurn: number,
  awardDeadlineTurn: number
): boolean {
  return (
    Number.isSafeInteger(turn) &&
    turn >= 1 &&
    Number.isSafeInteger(closesTurn) &&
    Number.isSafeInteger(awardDeadlineTurn) &&
    closesTurn - turn >= BIDDING_TURNS_MIN &&
    closesTurn - turn <= BIDDING_TURNS_MAX &&
    awardDeadlineTurn - closesTurn === AWARD_WINDOW_TURNS
  );
}
export function normalizePage(raw: string | null): number {
  const n = Number(raw ?? 1);
  return Number.isSafeInteger(n) && n > 0 && n <= 100000 ? n : 1;
}
export function officeContractType(
  countryId: string,
  positionId: string,
  financePositionId: string | undefined,
  defencePositionId: string | null | undefined
): "defence" | "extraction" | null {
  if (!countryId) return null;
  if (positionId === defencePositionId) return "defence";
  if (positionId === financePositionId) return "extraction";
  return null;
}
