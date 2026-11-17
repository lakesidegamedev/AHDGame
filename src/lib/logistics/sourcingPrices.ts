import type { FairForeignDemand } from "@/lib/logistics/sourcingTypes";

import { type FreightClass } from "@/lib/logistics/freightClass";

// ── Tuning constants (dark-ledger calibrated; money wiring still off) ────────

/**
 * Freight (TEU) consumed per commodity unit per state-line crossing, by class.
 * Special care hauls fewer goods per TEU-equivalent, hence the higher factor.
 * Calibrated so interstate haul is visible on the Logistics map rather than
 * reading as a tiny state market. Commodity unit counts and freight TEU
 * supply share {@link getEraUnitScale}, so this ratio is era-invariant; see
 * {@link freightTeuPerUnitHop}.
 */
/**
 * Price weight per commodity unit per state-line crossing, by class.
 *
 * Deliberately kept at the original v1 calibration while
 * {@link FREIGHT_TEU_PER_UNIT_HOP} carries the capacity weight. The capacity
 * weight makes a haul visible on the Logistics map; this weight converts the
 * freight-market price into a shipping charge buyers can compare with the
 * cargo price. Coupling them made the capacity calibration multiply every
 * shipping bill and priced low-value cargo out before the network could
 * become capacity bound.
 */
export const FREIGHT_PRICE_TEU_PER_UNIT_HOP: Record<FreightClass, number> = {
  bulk: 0.001,
  special: 0.003,
  grid: 0,
};

/**
 * Ceiling on a haulage leg's shipping charge per unit, as a share of the
 * seller's ask. The per-hop rate above is retuned so a typical 2 to 4 hop bulk
 * haul costs about 5 to 12 percent of the cargo at the base freight price, but
 * the freight price floats with the market (2.8x base while haulage is short),
 * so the rate alone cannot promise that. This bound is the backstop: a haul
 * never costs more than a fraction of the goods it carries, however tight
 * freight gets. Grid legs are wheeled at a fraction of the ask and need no cap.
 */
export const FREIGHT_SHIPPING_MAX_ASK_SHARE = 0.4;

/** Bound a haulage leg's per-unit shipping charge at a share of the ask. */
export function boundedShippingPerUnit(shippingPerUnit: number, ask: number): number {
  return Math.min(shippingPerUnit, Math.max(0, ask) * FREIGHT_SHIPPING_MAX_ASK_SHARE);
}

/**
 * Surcharge on the shipping leg for units moving above nominal capacity.
 *
 * Sized against BUYER_TOLERANCE_SLACK (0.35 of the whole landed price): a
 * surcharge on the shipping LEG alone at this rate stays well inside the
 * buyer's tolerance for a short haul and prices itself out on a long one,
 * which is the behaviour we want. Deliberately not 1.0: at a full doubling of
 * the shipping leg almost no real route clears the ceiling, and a congestion
 * price that never clears is just the old wall with extra steps.
 */
export const FREIGHT_CONGESTION_SURCHARGE = 0.35;

export /**
 * Landed price for a haul whose units move above nominal capacity. The pass
 * charges the surcharge only on the overflow units, so this is the price the
 * ceiling test uses to decide whether overflow may happen at all.
 */
function congestedLandedPrice(landed: number, shippingPerUnit: number): number {
  return landed + shippingPerUnit * FREIGHT_CONGESTION_SURCHARGE;
}

export /**
 * TEU per commodity-unit per hop on the world's era unit basis.
 *
 * Do not divide by `eraUnitScale`: under plants, both commodity balances and
 * freight TEU supply are already on that basis, so the haul ratio stays
 * real-terms invariant across eras. `eraUnitScale` is accepted for call-site
 * symmetry with other plants helpers (and for money-wiring rates later).
 */
/** Freight-price weight per commodity unit per hop on the era unit basis. */
function freightPriceTeuPerUnitHop(freightClass: FreightClass, eraUnitScale: number = 1): number {
  void eraUnitScale;
  return FREIGHT_PRICE_TEU_PER_UNIT_HOP[freightClass];
}

/**
 * Buyer tolerance ceiling = local state price × (1 + slack). Above it, demand
 * goes unmet and the shortage feeds back through prices next turn.
 */
export const BUYER_TOLERANCE_SLACK = 0.35;

export /**
 * A severely short local market is willing to search farther up the landed
 * supply curve. The extra ceiling starts only below 50 percent local fill and
 * rises linearly to 40 percentage points when no local supply exists. The
 * feature remains dark unless the caller opts in.
 */
const SHORTAGE_TOLERANCE_TRIGGER_FILL = 0.5;

export const SHORTAGE_TOLERANCE_MAX_EXTRA = 0.4;

export function shortageResponsiveToleranceSlack(args: {
  localSupply: number;
  localDemand: number;
  enabled: boolean;
}): number {
  if (!args.enabled || !(args.localDemand > 0)) return BUYER_TOLERANCE_SLACK;
  const localFill = Math.max(0, Math.min(1, args.localSupply / args.localDemand));
  const severity = Math.max(
    0,
    Math.min(1, (SHORTAGE_TOLERANCE_TRIGGER_FILL - localFill) / SHORTAGE_TOLERANCE_TRIGGER_FILL)
  );
  return BUYER_TOLERANCE_SLACK + SHORTAGE_TOLERANCE_MAX_EXTRA * severity;
}

export /**
 * Split one foreign country's scarce spare by max-min fair share.
 * Buyers with less remaining demand are filled first, and the rest share what
 * remains equally. The result is a per-buyer cap for this commodity pass.
 */
function fairForeignBudgets(
  totalSupply: number,
  demands: readonly FairForeignDemand[]
): Map<string, number> {
  const budgets = new Map<string, number>();
  let remainingSupply = Math.max(0, totalSupply);
  let active = demands.filter((demand) => demand.demandUnits > 0).map((demand) => ({ ...demand }));

  while (active.length > 0 && remainingSupply > Number.EPSILON) {
    const equalShare = remainingSupply / active.length;
    const capped = active.filter((demand) => demand.demandUnits <= equalShare);
    if (capped.length === 0) {
      for (const demand of active) budgets.set(demand.buyerStateId, equalShare);
      break;
    }

    const cappedIds = new Set(capped.map((demand) => demand.buyerStateId));
    for (const demand of capped) {
      budgets.set(demand.buyerStateId, demand.demandUnits);
      remainingSupply = Math.max(0, remainingSupply - demand.demandUnits);
    }
    active = active.filter((demand) => !cappedIds.has(demand.buyerStateId));
  }

  return budgets;
}
