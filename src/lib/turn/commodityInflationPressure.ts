/**
 * Commodity cost-push signal for inflation: the median annualized change in a
 * country's national commodity prices over the last half game year. Shared by
 * the turn's inflation step and the admin inflation diagnostics so both read
 * the same number.
 */
import type { Db } from "mongodb";
import type { CommodityPrice } from "@/lib/db/types/commodityPrice";
import type { CommodityPriceHistory } from "@/lib/db/types/commodityPriceHistory";
import { TURNS_PER_YEAR } from "@/lib/constants/turnTime";

/**
 * Lookback for the commodity cost-push signal: half a game year, annualized.
 *
 * Window choice is a lag-vs-noise trade and was picked off live prod data at
 * turn 221. A full game year still carried a price ramp that had already ended
 * (US would have read +20%/yr against an actual recent trend of roughly zero);
 * a 12-turn window has to be raised to the 4th power to annualize, which
 * amplifies ordinary market jitter. Half a year squares, and reproduced the
 * observed direction for every country.
 */
const COMMODITY_INFLATION_LOOKBACK_TURNS = TURNS_PER_YEAR / 2;
/** Shorter fallback for worlds younger than the main window. */
const COMMODITY_INFLATION_SHORT_LOOKBACK_TURNS = 12;

export interface CommodityPressureSnapshot {
  commodity: string;
  nationalPrices?: Record<string, number>;
  /** The same commodity's national prices one lookback window ago. */
  priorNationalPrices?: Record<string, number>;
  /** Turns between the two snapshots, for annualizing the change. */
  lookbackTurns: number;
}

function pickPreferredCommodityDoc(
  current: CommodityPrice | undefined,
  candidate: CommodityPrice
): CommodityPrice {
  if (!current) return candidate;
  const currentTurn = typeof current.turn === "number" ? current.turn : -1;
  const candidateTurn = typeof candidate.turn === "number" ? candidate.turn : -1;
  if (candidateTurn !== currentTurn) {
    return candidateTurn > currentTurn ? candidate : current;
  }
  const currentUpdated = current.updatedAt instanceof Date ? current.updatedAt.getTime() : 0;
  const candidateUpdated = candidate.updatedAt instanceof Date ? candidate.updatedAt.getTime() : 0;
  return candidateUpdated > currentUpdated ? candidate : current;
}

export function buildCommodityPressureSnapshots(
  commodityPriceDocs: CommodityPrice[],
  commodityPriceHistoryDocs: CommodityPriceHistory[],
  priorHistoryDocs: CommodityPriceHistory[],
  lookbackTurns: number
): CommodityPressureSnapshot[] {
  const currentByCommodity = new Map<string, CommodityPrice>();
  for (const doc of commodityPriceDocs) {
    currentByCommodity.set(
      doc.commodity,
      pickPreferredCommodityDoc(currentByCommodity.get(doc.commodity), doc)
    );
  }

  const historyByCommodity = new Map(
    commodityPriceHistoryDocs.map((doc) => [doc.commodity, doc] as const)
  );
  const priorByCommodity = new Map(priorHistoryDocs.map((doc) => [doc.commodity, doc] as const));

  return [...currentByCommodity.values()].map((doc) => ({
    commodity: doc.commodity,
    nationalPrices: historyByCommodity.get(doc.commodity)?.nationalPrices ?? doc.nationalPrices,
    priorNationalPrices: priorByCommodity.get(doc.commodity)?.nationalPrices,
    lookbackTurns,
  }));
}

/** Median of a non-empty numeric list. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Per-commodity clamp on the ANNUALIZED price change. A row moving more than
 * +200%/yr or less than -50%/yr is a market pathology (or corrupt data), not a
 * consumer-price signal. The median is already robust to a handful of
 * outliers, so this only guards against garbage.
 */
const COMMODITY_PRESSURE_ROW_FLOOR = -0.5;
const COMMODITY_PRESSURE_ROW_CEILING = 2.0;

/**
 * Load the current and lookback national prices for `priceTurn`. Prefers the
 * half-year window; falls back to the quarter window (scaled up to an annual
 * rate) only while the world is too young to have the former.
 */
export async function loadCommodityPressureSnapshots(
  db: Db,
  priceTurn: number
): Promise<CommodityPressureSnapshot[]> {
  const historyAt = (turn: number): Promise<CommodityPriceHistory[]> =>
    db
      .collection<CommodityPriceHistory>("commodityPriceHistory")
      .find({ turn }, { projection: { commodity: 1, nationalPrices: 1 } })
      .toArray();
  const [commodityPriceDocs, commodityPriceHistoryDocs, priorYearDocs, priorQuarterDocs] =
    await Promise.all([
      db
        .collection<CommodityPrice>("commodityPrices")
        .find(
          {},
          { projection: { commodity: 1, basePrice: 1, nationalPrices: 1, turn: 1, updatedAt: 1 } }
        )
        .toArray(),
      historyAt(priceTurn),
      historyAt(priceTurn - COMMODITY_INFLATION_LOOKBACK_TURNS),
      historyAt(priceTurn - COMMODITY_INFLATION_SHORT_LOOKBACK_TURNS),
    ]);
  const usableLookback =
    priorYearDocs.length > 0
      ? { docs: priorYearDocs, turns: COMMODITY_INFLATION_LOOKBACK_TURNS }
      : { docs: priorQuarterDocs, turns: COMMODITY_INFLATION_SHORT_LOOKBACK_TURNS };
  return buildCommodityPressureSnapshots(
    commodityPriceDocs,
    commodityPriceHistoryDocs,
    usableLookback.docs,
    usableLookback.turns
  );
}

/** Median annualized national price change for one country; 0 with no lookback. */
export function commodityPressureForCountry(
  snapshots: CommodityPressureSnapshot[],
  countryId: string
): number {
  const pressures: number[] = [];
  for (const doc of snapshots) {
    const nationalPrice = doc.nationalPrices?.[countryId];
    const priorPrice = doc.priorNationalPrices?.[countryId];
    if (
      typeof nationalPrice === "number" &&
      Number.isFinite(nationalPrice) &&
      nationalPrice > 0 &&
      typeof priorPrice === "number" &&
      Number.isFinite(priorPrice) &&
      priorPrice > 0 &&
      doc.lookbackTurns > 0
    ) {
      // Scale a partial-year window up to an annual rate.
      const annualized =
        Math.pow(nationalPrice / priorPrice, TURNS_PER_YEAR / doc.lookbackTurns) - 1.0;
      const clamped = Math.max(
        COMMODITY_PRESSURE_ROW_FLOOR,
        Math.min(COMMODITY_PRESSURE_ROW_CEILING, annualized)
      );
      if (Number.isFinite(clamped)) pressures.push(clamped);
    }
  }
  return pressures.length > 0 ? median(pressures) : 0.0;
}
