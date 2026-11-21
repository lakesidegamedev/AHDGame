/**
 * Which sales record a plant's page reads.
 *
 * Where the funded producer market settles a plant, its settlement
 * (`sector.producerSettlement`) is what the plant was paid on. The legacy
 * market pass still stamps its own fill on the sector (`soldFraction`,
 * `soldByCommodity`, `lowFillTurns` and the rest), and that reading can sit far
 * from the paid one. The settlement wins over a legacy fill of the same turn or
 * older. A legacy fill stamped on a later turn means the plant was not settled
 * since, so the legacy reading is the latest one; the two turns are never mixed.
 *
 * Pure: plain data in, the record to read (or null) out.
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
