/**
 * What buyers paid per book lane on the turn a sector's receipt settled.
 *
 * Read by the turn engine's own id, `${worldEpoch}:${turn}`, never by sorting
 * on `turn`: the collection also holds a per-epoch share document with its own
 * `turn`, and has no `turn` index. Nothing is read when there is no fresh
 * receipt, no epoch, or the receipt is older than last turn.
 */
import type { Db } from "mongodb";
import { PRODUCER_MARKET_OUTCOMES } from "@/lib/market/producerMarket/fundedLedgerRules";

export async function loadReceiptLanePrices(
  db: Db,
  args: {
    worldEpochId: string | null | undefined;
    receiptTurn: number | null | undefined;
    currentTurn: number;
  }
): Promise<{ laneClearingPrices?: Readonly<Record<string, number | undefined>> }> {
  const { worldEpochId, receiptTurn, currentTurn } = args;
  if (!worldEpochId || typeof receiptTurn !== "number" || !(receiptTurn >= currentTurn - 1))
    return {};
  const doc = await db
    .collection<{ _id: string; laneClearingPrices?: Record<string, number> }>(
      PRODUCER_MARKET_OUTCOMES
    )
    .findOne({ _id: `${worldEpochId}:${receiptTurn}` }, { projection: { laneClearingPrices: 1 } });
  return doc?.laneClearingPrices ? { laneClearingPrices: doc.laneClearingPrices } : {};
}
