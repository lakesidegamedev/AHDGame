/**
 * Fraction of dispatched units lost per hop on the grid/pipeline network:
 * resistive line loss on the wire, compressor fuel on the pipe. This is what
 * makes grid distance real without a hard capacity ceiling, so a state can
 * always import power at a price rather than being told no.
 *
 * 3%/hop puts a six-hop haul at ~17% loss, which is punitive enough that
 * generating near load still wins and cross-continent wheeling stays a
 * last resort.
 */
export const GRID_LOSS_PER_HOP = 0.03;

/**
 * Wheeling charge per hop as a fraction of the seller's ask. The grid operator
 * is not the trucking market, so grid legs must not be priced off the `freight`
 * commodity: a freight price spike has no business making the lights more
 * expensive. Small per hop, but it still puts distant generation behind local
 * generation in the landed-price sort, which is the ordering we want.
 */
export const GRID_WHEELING_PER_HOP_FRACTION = 0.02;

/**
 * How far a state's haulage may be pushed past its nominal shared capacity
 * before nothing more moves, and what the overflow costs.
 *
 * Past nominal capacity the network still moves goods, at a surcharge that
 * rises with how far past capacity it is pushed; the buyer's tolerance
 * ceiling is what finally stops the flow. Freight is a COST, not a hard wall,
 * so a state can still ship even when its own capacity is exhausted.
 */
export const FREIGHT_CONGESTION_OVERFLOW = 0.5;

/**
 * Overseas legs are priced and capacity-free as a flat hop-equivalent
 * (plan open question 3: flat sea freight first; no origin-state network is
 * modeled for foreign sellers, so imports consume no domestic capacity).
 */
export const SEA_FREIGHT_HOP_EQUIV = 6;

export /**
 * Fallback hop distance when two same-country states have no adjacency route
 * (e.g. HI): treated like a sea leg.
 */
const UNREACHABLE_HOP_EQUIV = SEA_FREIGHT_HOP_EQUIV;

export /** Flows below this many units are summed into the doc totals but not itemized. */
const FLOW_RECORD_FLOOR_UNITS = 1;

export const OWN_LEG_TERMS = {
  baseCeiling: Number.POSITIVE_INFINITY,
  ceiling: Number.POSITIVE_INFINITY,
};
