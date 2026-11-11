/** Whole-order conversion refunds reverse both unfinished and delivered investment. */
import type { CorporateSector } from "@/lib/db/types/corporation";
import { rollbackConstruction } from "@/lib/corporations/rules/constructionRollback";
export function quoteConversionConstructionRefund(
  sector: CorporateSector,
  turn: number,
  wholePlants = false
) {
  const queue = sector.buildQueue ?? [];
  for (const order of queue) {
    if (
      ![order.unitsOrdered, order.costPaidAnchor, order.startTurn, order.onlineTurn].every(
        Number.isFinite
      ) ||
      order.unitsOrdered < 0 ||
      order.costPaidAnchor < 0
    )
      throw new Error("Invalid conversion construction order");
  }
  const anchor = queue.reduce((sum, order) => sum + Math.max(0, order.costPaidAnchor), 0);
  const rollback = rollbackConstruction(sector, queue, turn, wholePlants);
  if (![anchor, ...Object.values(rollback)].every(Number.isFinite))
    throw new Error("Invalid conversion construction quote");
  return {
    anchor,
    units: queue.reduce(
      (sum, order) => sum + (order.costPaidAnchor > 0 ? order.unitsOrdered : 0),
      0
    ),
    set: {
      buildQueue: [],
      constructionInProgressAnchor: 0,
      ...rollback,
    },
  };
}
