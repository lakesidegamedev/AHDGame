/**
 * Public buyers clear their own country's sellers first.
 *
 * Settlement takes orders of equal priority in id order, and a public order's
 * id embeds its country code. On a scarce world book that is an alphabetical
 * queue: on live turn 663 the AT to JP governments bought 1,355 units of
 * ordnance a turn, most of it from United States plants, before the US order
 * (2,573 units, limit 19,222 against asks of 1,353 to 2,029) came up, and the
 * US order got none. With gameConfig.producerPublicHomeFirstStage on, a public
 * world-book order is flagged so settleProducerMarket clears its own country's
 * sellers before the ordinary pass. Plain data in, plain data out.
 */
import type { PurchaseOrder } from "./rules";

/** gameConfig.producerPublicHomeFirstStage: >= 1 lets public buyers buy at home first. */
export function publicHomeFirstOn(stage: number | null | undefined): boolean {
  return (stage ?? 0) >= 1;
}

/**
 * Flag every world-book order that names its country. State and country books
 * already hold only domestic sellers, so they are left as they are. Mutates
 * and returns the orders, like the route eligibility pass beside it.
 */
export function markHomeCountryFirst<T extends PurchaseOrder>(orders: T[]): T[] {
  for (const order of orders)
    if (order.book === "world" && order.countryId) order.homeCountryFirst = true;
  return orders;
}
