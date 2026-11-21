import type { Db } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { GameConfig } from "@/lib/db/types";

import { MARKET_MODE_ORDER, type MarketSystemMode } from "@/lib/market/modes";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";

/**
 * Structural market rework rollout mode ("Nothing Wants to Sell", audit t806).
 * Graduated and ordered — each tier is a superset of the previous one. See
 * docs/plans/2026-07-03-market-structural-plan.md. The mode enum/order/TLDRs
 * live in the client-safe `modes.ts`; this module adds the server-side
 * resolution (Mongo) and comparisons.
 */
export { MARKET_MODE_ORDER, type MarketSystemMode } from "@/lib/market/modes";

export function isMarketSystemMode(value: unknown): value is MarketSystemMode {
  return typeof value === "string" && (MARKET_MODE_ORDER as readonly string[]).includes(value);
}

/** Numeric rank of a mode (off=0 … plants=5). */
function marketModeRank(mode: MarketSystemMode): number {
  return MARKET_MODE_ORDER.indexOf(mode);
}

/** True when `mode` is at least the given `tier` (inclusive). */
export function marketAtLeast(mode: MarketSystemMode, tier: MarketSystemMode): boolean {
  return marketModeRank(mode) >= marketModeRank(tier);
}

/**
 * The economy runs at the plants tier. A stored `marketSystemMode` is ignored
 * on every read, so no configuration can put a world on a lower tier.
 * The preloaded-config argument is accepted so existing call sites keep
 * compiling while they are migrated off the tier ladder.
 */
export async function getMarketSystemMode(
  _preloadedConfig?: Pick<GameConfig, "marketSystemMode"> | null
): Promise<MarketSystemMode> {
  return "plants";
}

/** Explicit-handle variant of {@link getMarketSystemMode}; the handle is unused. */
export async function getMarketSystemModeForDb(_db: Db): Promise<MarketSystemMode> {
  return "plants";
}

/**
 * Structural extraction-shortage stabilizer (audit t873). Independent of the
 * marketSystemMode ladder — a standalone boolean so it can be dialed in on its
 * own (e.g. enabled in a sandbox sim to validate before touching prod).
 * Pass a preloaded config to avoid an extra read.
 */
export async function getExtractionOutputScaleEnabled(
  preloadedConfig?: Pick<GameConfig, "extractionOutputScaleEnabled"> | null
): Promise<boolean> {
  if (preloadedConfig !== undefined) return preloadedConfig?.extractionOutputScaleEnabled === true;
  const db = await getDb();
  const config = await gameConfigCollection(db).findOne(
    { _id: "default" },
    { projection: { extractionOutputScaleEnabled: 1 } }
  );
  return config?.extractionOutputScaleEnabled === true;
}

/**
 * Demographics-as-4th-demand-source flag (default off; uncalibrated). Routed
 * through this helper (not a direct findOne) so tests can mock it without a
 * gameConfig.findOne on their shared mock db.
 */
export async function getDemographicsDemandEnabled(
  preloadedConfig?: Pick<GameConfig, "demographicsDemandEnabled"> | null
): Promise<boolean> {
  if (preloadedConfig !== undefined) return preloadedConfig?.demographicsDemandEnabled === true;
  const db = await getDb();
  const config = await gameConfigCollection(db).findOne(
    { _id: "default" },
    { projection: { demographicsDemandEnabled: 1 } }
  );
  return config?.demographicsDemandEnabled === true;
}

/**
 * Household Ledger — income-driven consumer demand flag (default off;
 * uncalibrated). Routed through this helper (not a direct findOne) so tests can
 * mock it without a gameConfig.findOne on their shared mock db. When on, the
 * household consumption pass runs and the retail-revenue consumer proxy is
 * suppressed — see `householdConsumptionEnabled` in gameConfig and
 * `src/lib/turn/householdConsumption.ts`.
 */
export async function getHouseholdConsumptionEnabled(
  preloadedConfig?: Pick<GameConfig, "householdConsumptionEnabled"> | null
): Promise<boolean> {
  if (preloadedConfig !== undefined) return preloadedConfig?.householdConsumptionEnabled === true;
  const db = await getDb();
  const config = await gameConfigCollection(db).findOne(
    { _id: "default" },
    { projection: { householdConsumptionEnabled: 1 } }
  );
  return config?.householdConsumptionEnabled === true;
}
