/**
 * What a sold percentage means. Sellers asking the same price are weighed as
 * one group and each buyer order is split across the group in proportion to
 * stock, so every site in the group is filled to the same share. The figure
 * measures the group against all its buyers, not one site's own demand.
 */
export const SOLD_SHARE_POOL_NOTE =
  "Buyers split each order across every seller asking the same price, in proportion to the stock each offers. Sites of one company asking the same price therefore sell the same percentage, and that percentage is set by all buyers and all sellers in the market, not by one site. A lower asking price sells a larger share.";

/** Tooltip for a sold share over what the plants offered, with the pooling note. */
export function soldShareTitle(prefix: string): string {
  return `${prefix} ${SOLD_SHARE_POOL_NOTE}`;
}
