/**
 * Public buyers share a scarce world book fairly.
 *
 * Settlement takes orders of equal priority in id order, and a public order's
 * id embeds its country code, so whatever the home-first pass leaves on a
 * world book went to governments alphabetically: on live turn 663 Japan took
 * the last ordnance and Russia, the United Kingdom and every later country got
 * none. With gameConfig.producerPublicFairShareStage on, public world-book
 * orders are flagged so settleProducerMarket clears each price level across
 * them together, pro rata to what each still wants. Plain data in, plain data
 * out.
 */
import type { PurchaseOrder } from "./rules";

/** gameConfig.producerPublicFairShareStage: >= 1 shares world-book levels across public buyers. */
export function publicFairShareOn(stage: number | null | undefined): boolean {
  return (stage ?? 0) >= 1;
}

/**
 * Flag every world-book order that names its country, the same set the
 * home-first pass flags. Mutates and returns the orders.
 */
export function markPublicFairShare<T extends PurchaseOrder>(orders: T[]): T[] {
  for (const order of orders) if (order.book === "world" && order.countryId) order.fairShare = true;
  return orders;
}

/**
 * Split `supply` across rows pro rata to `weight`, never giving a row more
 * than its `cap`. A capped row's unused share goes back to the others in the
 * same proportions (water filling). Rows with no weight or no cap get 0. The
 * result is in input order and its sum is min(supply, total cap).
 */
export function proRataShares(
  supply: number,
  rows: readonly { weight: number; cap: number }[]
): number[] {
  const shares = rows.map(() => 0);
  let left = supply;
  let open = rows.flatMap((row, i) => (row.weight > 0 && row.cap > 0 ? [i] : []));
  while (open.length > 0 && left > 0) {
    const weight = open.reduce((sum, i) => sum + rows[i].weight, 0);
    const capped = open.filter((i) => (left * rows[i].weight) / weight >= rows[i].cap);
    if (capped.length === 0) {
      for (const i of open) shares[i] = (left * rows[i].weight) / weight;
      break;
    }
    for (const i of capped) {
      shares[i] = rows[i].cap;
      left = Math.max(0, left - rows[i].cap);
    }
    open = open.filter((i) => !capped.includes(i));
  }
  return shares;
}
