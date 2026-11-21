import type { CorporateSector } from "@/lib/db/types";
import { PRODUCER_CATCH_UP_TURNS } from "../capacityRules";

/** Only an unused, empty entrant may open before the last global settlement. */
export function excludedEntrantOpening(
  sector: Pick<
    CorporateSector,
    | "producerCapacity"
    | "producerInventory"
    | "producerSettlement"
    | "capitalStock"
    | "capacityBookAnchor"
    | "buildQueue"
  >,
  worldEpoch: string,
  turn: number,
  settledTurn: number,
  included: boolean
): number | null {
  const capacity = sector.producerCapacity;
  const stock = sector.producerInventory;
  if (
    included ||
    !capacity ||
    !stock ||
    sector.producerSettlement ||
    capacity.worldEpoch !== worldEpoch ||
    stock.worldEpoch !== worldEpoch ||
    !Number.isSafeInteger(capacity.turn) ||
    capacity.turn < 0 ||
    stock.turn !== capacity.turn ||
    capacity.turn >= settledTurn ||
    turn - capacity.turn > PRODUCER_CATCH_UP_TURNS + 1 ||
    sector.capitalStock !== 0 ||
    sector.capacityBookAnchor !== 0 ||
    !Array.isArray(stock.inputStock) ||
    !Array.isArray(stock.outputStock) ||
    stock.inputStock.length !== 0 ||
    stock.outputStock.length !== 0 ||
    !Array.isArray(sector.buildQueue)
  )
    return null;
  return capacity.turn;
}
