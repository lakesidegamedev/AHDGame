/**
 * How a store's money is shown (owner decision 2026-11-27): revenue is the full
 * value of the goods it sold to households, what it paid producers for them is
 * its own cost line, and profit is the markup less running costs.
 *
 * Display only. The engine's economic revenue for a store stays its markup:
 * compliance, management overhead and revenue effects are charged on that, and
 * counting the resold goods there would multiply them. Pure, no database.
 */
import type { CorporateSector } from "@/lib/db/types";

/**
 * Wholesale value of the goods a store resold on its last settled turn, as a
 * daily figure in the sector's own currency. Settlement receipts are anchor
 * per turn; `anchorPerLocal` is anchor per one unit of the sector's currency.
 * Zero for anything that is not a store with a settled store receipt.
 */
export function storeGoodsResoldDaily(
  sector: Pick<CorporateSector, "sectorType" | "producerSettlement">,
  turnsPerDay: number,
  anchorPerLocal: number
): number {
  if (sector.sectorType !== "retail") return 0;
  const goods = sector.producerSettlement?.store?.goodsBoughtWholesale;
  if (typeof goods !== "number" || !Number.isFinite(goods) || !(goods > 0)) return 0;
  if (!(anchorPerLocal > 0) || !Number.isFinite(anchorPerLocal)) return 0;
  return (goods * turnsPerDay) / anchorPerLocal;
}
