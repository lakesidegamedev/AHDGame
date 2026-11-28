/**
 * Political advertising (funded local media orders). Orders use only advertising
 * units left after commercial buyers clear, and each unit is sold at its quoted
 * anchor value. See allocatePoliticalAdOrders.
 */

export interface PoliticalAdOrderDemand {
  orderId: string;
  countryId: string;
  stateId: string;
  createdTurn: number;
  budgetAnchor: number;
  /**
   * A nationwide order (a presidential campaign's media budget) may buy unsold
   * airtime anywhere in its country once its target state has none left. Other
   * orders, such as regional targeted ads, stay inside their target state.
   */
  countryWide?: boolean;
}

export interface PoliticalAdSellerOffer {
  sectorId: string;
  corporationId: string;
  countryId: string;
  stateId: string;
  /** Total available output units after any commercial sales. */
  unsoldUnits: number;
  /** Units offered before commercial sales, for the final sold fraction. */
  offeredUnits: number;
  /** Price of one unit after the ordinary book's posture and price factors. */
  unitPriceAnchor: number;
  /** Captured at quote time and used to calculate the seller's native cash receipt. */
  sellerLocalPerAnchor: number;
}

export interface PoliticalAdSellerAllocation {
  orderId: string;
  sectorId: string;
  corporationId: string;
  units: number;
  amountAnchor: number;
  sellerLocalAmount: number;
  sellerLocalPerAnchor: number;
  soldFractionAfterAllocation: number;
}

export interface PoliticalAdOrderAllocation {
  orderId: string;
  requestedAnchor: number;
  deliveredAnchor: number;
  /** Funded fallback spend when no advertising outlet operates in the target state. */
  fallbackAnchor: number;
  unfilledAnchor: number;
  deliveredUnits: number;
  sellers: PoliticalAdSellerAllocation[];
}

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Spend one quarter of a funded order for a weaker local effect when no outlet exists. */
const POLITICAL_MEDIA_NO_OUTLET_FALLBACK_SHARE = 0.25;

/**
 * Smallest allocation worth a seller receipt, one hundredth of an anchor.
 * Residual arithmetic leaves floating point dust (around 1e-14 units). A
 * receipt that small does not change a seller's cash balance, so the money
 * move refuses the whole settlement and the order's escrow is stranded.
 * Anything below this is treated as no airtime at all.
 */
export const POLITICAL_MEDIA_MIN_ALLOCATION_ANCHOR = 0.01;

export function politicalMediaStateKey(countryId: string, stateId: string): string {
  return `${countryId}:${stateId}`;
}

/** Fraction of the frozen requested anchor budget that actually cleared. */
export function politicalMediaFillRatio(deliveredAnchor: number, requestedAnchor: number): number {
  if (
    !Number.isFinite(deliveredAnchor) ||
    !Number.isFinite(requestedAnchor) ||
    deliveredAnchor <= 0 ||
    requestedAnchor <= 0
  )
    return 0;
  return Math.max(0, Math.min(1, deliveredAnchor / requestedAnchor));
}

/**
 * Allocate funded political ad orders after commercial buyers. Every order
 * first buys in its exact country and state, cheapest ordinary offer first with
 * stable ids as tie breakers. Country-wide orders then buy whatever unsold
 * airtime remains elsewhere in their country, so a national campaign is not
 * left with nothing because one state's stations are sold out. The caller
 * supplies residual units, so no output already sold commercially can be
 * offered again.
 */
export function allocatePoliticalAdOrders(
  orders: readonly PoliticalAdOrderDemand[],
  sellers: readonly PoliticalAdSellerOffer[],
  statesWithOutlets: ReadonlySet<string> = new Set(),
  fallbackEligibleStates: ReadonlySet<string> = new Set()
): PoliticalAdOrderAllocation[] {
  const remainingBySector = new Map(
    sellers.map((seller) => [
      seller.sectorId,
      Number.isFinite(seller.unsoldUnits) ? Math.max(0, seller.unsoldUnits) : 0,
    ])
  );
  const orderedOrders = [...orders].sort(
    (a, b) => a.createdTurn - b.createdTurn || compareText(a.orderId, b.orderId)
  );
  const usableSellers = sellers
    .filter(
      (seller) =>
        Number.isFinite(seller.unitPriceAnchor) &&
        seller.unitPriceAnchor > 0 &&
        Number.isFinite(seller.sellerLocalPerAnchor) &&
        seller.sellerLocalPerAnchor > 0
    )
    .sort(
      (a, b) =>
        a.unitPriceAnchor - b.unitPriceAnchor ||
        compareText(a.corporationId, b.corporationId) ||
        compareText(a.sectorId, b.sectorId)
    );

  const states = orderedOrders.map((order) => ({
    order,
    remainingAnchor:
      Number.isFinite(order.budgetAnchor) && order.budgetAnchor > 0 ? order.budgetAnchor : 0,
    deliveredAnchor: 0,
    deliveredUnits: 0,
    matchedSellers: 0,
    allocations: [] as PoliticalAdSellerAllocation[],
  }));

  const buy = (
    entry: (typeof states)[number],
    matches: (seller: PoliticalAdSellerOffer) => boolean
  ) => {
    for (const seller of usableSellers) {
      if (!(entry.remainingAnchor >= POLITICAL_MEDIA_MIN_ALLOCATION_ANCHOR)) break;
      if (!matches(seller)) continue;
      const availableUnits = remainingBySector.get(seller.sectorId) ?? 0;
      if (!(availableUnits * seller.unitPriceAnchor >= POLITICAL_MEDIA_MIN_ALLOCATION_ANCHOR))
        continue;
      entry.matchedSellers += 1;
      const units = Math.min(availableUnits, entry.remainingAnchor / seller.unitPriceAnchor);
      const amountAnchor = units * seller.unitPriceAnchor;
      if (!(units > 0) || !(amountAnchor >= POLITICAL_MEDIA_MIN_ALLOCATION_ANCHOR)) continue;
      remainingBySector.set(seller.sectorId, availableUnits - units);
      const offeredUnits =
        Number.isFinite(seller.offeredUnits) && seller.offeredUnits > 0 ? seller.offeredUnits : 0;
      entry.allocations.push({
        orderId: entry.order.orderId,
        sectorId: seller.sectorId,
        corporationId: seller.corporationId,
        units,
        amountAnchor,
        sellerLocalAmount: amountAnchor * seller.sellerLocalPerAnchor,
        sellerLocalPerAnchor: seller.sellerLocalPerAnchor,
        soldFractionAfterAllocation:
          offeredUnits > 0
            ? Math.min(1, (offeredUnits - availableUnits + units) / offeredUnits)
            : 0,
      });
      entry.deliveredAnchor += amountAnchor;
      entry.deliveredUnits += units;
      entry.remainingAnchor = Math.max(0, entry.remainingAnchor - amountAnchor);
    }
  };

  // Target-state airtime goes to that state's own orders before any national
  // order may spill into it.
  for (const entry of states) {
    buy(
      entry,
      (seller) =>
        seller.countryId === entry.order.countryId && seller.stateId === entry.order.stateId
    );
  }
  for (const entry of states) {
    if (!entry.order.countryWide) continue;
    buy(
      entry,
      (seller) =>
        seller.countryId === entry.order.countryId && seller.stateId !== entry.order.stateId
    );
  }

  return states.map((entry) => {
    const { order } = entry;
    let fallbackAnchor = 0;
    if (
      entry.matchedSellers === 0 &&
      !statesWithOutlets.has(politicalMediaStateKey(order.countryId, order.stateId)) &&
      fallbackEligibleStates.has(politicalMediaStateKey(order.countryId, order.stateId))
    ) {
      fallbackAnchor =
        Math.min(
          Number.isFinite(order.budgetAnchor) ? Math.max(0, order.budgetAnchor) : 0,
          entry.remainingAnchor
        ) * POLITICAL_MEDIA_NO_OUTLET_FALLBACK_SHARE;
      entry.deliveredAnchor += fallbackAnchor;
      entry.remainingAnchor = Math.max(0, entry.remainingAnchor - fallbackAnchor);
    }

    return {
      orderId: order.orderId,
      requestedAnchor: Math.max(0, Number.isFinite(order.budgetAnchor) ? order.budgetAnchor : 0),
      deliveredAnchor: entry.deliveredAnchor,
      fallbackAnchor,
      unfilledAnchor: entry.remainingAnchor,
      deliveredUnits: entry.deliveredUnits,
      sellers: entry.allocations,
    };
  });
}
