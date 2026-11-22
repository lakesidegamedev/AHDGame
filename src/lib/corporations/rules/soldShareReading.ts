/** Sellers at one price are filled to the same share, so a sold share is set by the whole market. */
export const SOLD_SHARE_POOL_NOTE =
  "Buyers split each order across every seller asking the same price, in proportion to the stock each offers. Sites of one company asking the same price therefore sell the same percentage, and that percentage is set by all buyers and all sellers in the market, not by one site. A lower asking price sells a larger share.";

/** Tooltip for a sold share over what the plants offered, with the pooling note. */
export function soldShareTitle(prefix: string): string {
  return `${prefix} ${SOLD_SHARE_POOL_NOTE}`;
}
