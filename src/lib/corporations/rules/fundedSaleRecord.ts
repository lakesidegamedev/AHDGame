/**
 * Which sales record a plant's page reads.
 *
 * The funded settlement (`sector.producerSettlement`) is what the plant was
 * paid on, and it wins over a legacy fill of the same turn or older. A legacy
 * fill from a later turn means the plant was not settled since, so the legacy
 * reading is the latest one. The two turns are never mixed.
 */
export function fundedSaleRecord<T extends { turn: number }>(
  settlement: T | null | undefined,
  legacyFillTurn: number | null | undefined
): T | null {
  if (!settlement || typeof settlement.turn !== "number" || !Number.isFinite(settlement.turn))
    return null;
  if (
    typeof legacyFillTurn === "number" &&
    Number.isFinite(legacyFillTurn) &&
    legacyFillTurn > settlement.turn
  )
    return null;
  return settlement;
}
