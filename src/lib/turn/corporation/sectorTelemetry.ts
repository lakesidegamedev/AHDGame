import type { CorporateSector } from "@/lib/db/types";
import type { CurrencyCode } from "@/lib/constants/currencies";
import { GROWTH_RATE_TURNS_PER_YEAR } from "@/lib/constants/corporations";
import { trendGrowthRate } from "@/lib/utils/sectorGrowth";
import { readCorpEconomicAnchor, writeCorpEconomicLocal } from "@/lib/currency/corpEconomyFields";
import type { SectorClearingResult } from "@/lib/market/clearing";
import type { InventoryTurnResult } from "@/lib/corporations/sectorInventory";
import { STRANDED_LOW_FILL_THRESHOLD } from "@/lib/corporations/strandedPlant";

export function legacyRevenueShadowTelemetry(input: {
  sector: CorporateSector;
  isFlipTurn: boolean;
  preFlipNameplateRevenue: number;
  brakedTargetRate: number;
  newCurrentGrowthRate: number;
  embargoLegacyMothball: boolean;
  sectorCurrencyCode: CurrencyCode | undefined;
  sectorFxRate: number;
}): Record<string, unknown> {
  const {
    sector,
    isFlipTurn,
    preFlipNameplateRevenue,
    brakedTargetRate,
    newCurrentGrowthRate,
    embargoLegacyMothball,
    sectorCurrencyCode,
    sectorFxRate,
  } = input;
  const prevShadowLocal = sector.legacyRevenueShadow;
  const prevShadow =
    typeof prevShadowLocal === "number" && Number.isFinite(prevShadowLocal) && prevShadowLocal >= 0
      ? readCorpEconomicAnchor(prevShadowLocal, sectorCurrencyCode, sectorFxRate)
      : null;
  const legacyTargetRate =
    !isFlipTurn &&
    typeof sector.legacyTargetGrowthRateShadow === "number" &&
    Number.isFinite(sector.legacyTargetGrowthRateShadow)
      ? sector.legacyTargetGrowthRateShadow
      : brakedTargetRate;
  const legacyCurrentRate =
    !isFlipTurn &&
    typeof sector.legacyGrowthRateShadow === "number" &&
    Number.isFinite(sector.legacyGrowthRateShadow)
      ? trendGrowthRate(sector.legacyGrowthRateShadow, legacyTargetRate)
      : newCurrentGrowthRate;
  const legacyPerTurnRate = embargoLegacyMothball
    ? 0
    : legacyCurrentRate / GROWTH_RATE_TURNS_PER_YEAR;
  const nextShadowAnchor =
    isFlipTurn || prevShadow === null
      ? preFlipNameplateRevenue
      : prevShadow * (1 + legacyPerTurnRate / 100);

  return {
    legacyRevenueShadow: writeCorpEconomicLocal(nextShadowAnchor, sectorCurrencyCode, sectorFxRate),
    legacyGrowthRateShadow: legacyCurrentRate,
    legacyTargetGrowthRateShadow: legacyTargetRate,
  };
}

export function marketTelemetry(input: {
  clearingEnabled: boolean;
  /**
   * `fillMeasured: false` (tagged by the clearing pre-pass) means none of the
   * sector's outputs had a prior-turn demand book to clear against: the first
   * producing turn of a fresh world. Clearing then sells nothing by
   * construction, which says nothing about the market, so the fill telemetry
   * is left unwritten instead of recorded as zero. Pricing, low-fill counts
   * and NPP strategy all read it next turn.
   */
  clearing?: SectorClearingResult & { fillMeasured?: boolean };
  clearingFactor: number;
  currentTurn?: number;
  clearingStartTurn?: number | null;
  mothballed: boolean;
  sector: Pick<CorporateSector, "lowFillTurns">;
  inventoryTurn?: InventoryTurnResult;
}): Record<string, unknown> {
  const {
    clearingEnabled,
    clearing,
    clearingFactor,
    currentTurn,
    clearingStartTurn,
    mothballed,
    sector,
    inventoryTurn,
  } = input;
  const fillMeasured = clearing?.fillMeasured !== false;
  const update: Record<string, unknown> = {};

  if (clearingEnabled && clearing) {
    update.clearingFactor = Math.round(clearingFactor * 1000) / 1000;
    update.effectivePosture = Math.round(clearing.effectivePosture * 1000) / 1000;
    update.clearingStartTurn = clearingStartTurn ?? null;
  }

  if (clearingEnabled && clearing && fillMeasured) {
    update.soldFraction = Math.round(clearing.soldFraction * 1000) / 1000;
    if (!mothballed) {
      update.lowFillTurns =
        clearing.soldFraction < STRANDED_LOW_FILL_THRESHOLD ? (sector.lowFillTurns ?? 0) + 1 : 0;
    }
    update.soldByCommodity = roundedMap(clearing.soldByCommodity, 1000, (sold) =>
      Number.isFinite(sold)
    );
    // Per-output revenue share, so the sector page can show a sale price per
    // product instead of one blended average. Always overwritten (empty when
    // nothing sold) so a stale split never outlives the turn that wrote it.
    update.revenueShareByCommodity = roundedMap(
      clearing.revenueShareByCommodity,
      10000,
      (share) => Number.isFinite(share) && share > 0
    );
    if (Number.isSafeInteger(currentTurn)) {
      update.soldByCommodityTurn = currentTurn;
      if (clearing.deliveredUnitsByCommodity) {
        update.soldUnitsByCommodityTurn = currentTurn;
        update.soldUnitsByCommodity = roundedMap(
          clearing.deliveredUnitsByCommodity,
          undefined,
          (units) => Number.isFinite(units) && units >= 0
        );
      }
    }
  }

  if (inventoryTurn) {
    update.inventoryUnits = roundedMap(inventoryTurn.nextInventory, 100, (held) => held > 0);
    update.inventoryValueAnchor = Math.round(inventoryTurn.heldValueAnchor);
    update.inventoryDrainedUnits = Math.round(inventoryTurn.drainedUnits * 100) / 100;
    update.inventorySpoiledUnits = Math.round(inventoryTurn.spoiledUnits * 100) / 100;
  }

  return update;
}

/**
 * Copy the kept entries of a commodity record, rounding each to `scale`
 * decimals when one is given. A loop rather than entries/filter/map: this runs
 * once per sector per telemetry field, and the chain allocated three arrays for
 * a handful of keys.
 */
function roundedMap(
  source: object | null | undefined,
  scale: number | undefined,
  keep: (value: number) => boolean
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!source) return out;
  const rows = source as Record<string, number | undefined>;
  for (const commodity of Object.keys(rows)) {
    const value = rows[commodity];
    if (typeof value !== "number" || !keep(value)) continue;
    out[commodity] = scale === undefined ? value : Math.round(value * scale) / scale;
  }
  return out;
}

/**
 * Whether this turn's clearing measured the sector's fill. A book with no
 * prior-turn aggregate (the first producing turn after a reset) clears
 * nothing by construction; only outputs whose lagged book exists count.
 * Without the set (worlds and tests that predate it) every fill is measured.
 */
export function clearingFillMeasured(
  clearing: { soldByCommodity?: Partial<Record<string, number>> } | null | undefined,
  initializedLaggedBooks: ReadonlySet<string> | undefined
): boolean {
  if (!clearing || !initializedLaggedBooks) return true;
  const outputs = Object.keys(clearing.soldByCommodity ?? {});
  if (outputs.length === 0) return true;
  return outputs.some((commodity) => initializedLaggedBooks.has(commodity));
}
