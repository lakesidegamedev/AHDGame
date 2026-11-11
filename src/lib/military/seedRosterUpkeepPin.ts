import type { Db } from "mongodb";
import type { GameConfig } from "@/lib/db/types/gameConfig";
import { COUNTRY_CONFIGS, type CountryId } from "@/lib/constants/countries";
import { seedRosterUpkeepFor } from "@/lib/military/seedRosterUpkeep";
import { gameConfigCollection } from "@/lib/db/repositories/gameConfig";

/**
 * A world's OWN seed-roster upkeep denominators, captured at creation.
 *
 * `upkeepPerTurn` divides live roster cost by the cost of the roster the
 * country STARTED with, so a nation at its starting force pays exactly
 * `SEED_UPKEEP_TARGET_SHARE` of its appropriation. Deriving that denominator
 * at read time breaks when the SEED TABLE changes under an already-seeded
 * world: the live roster is a database fact, but the denominator would be
 * recomputed from the current source, silently re-pricing existing armies.
 *
 * The pin makes the denominator a property of a WORLD, fixed at seeding. It is
 * preferred at read time and falls back to derivation when absent so older
 * worlds keep working.
 *
 * MUST be rewritten on every reseed: `gameConfig` is not swept by teardown, so
 * a stale pin would hold the new world to the old world's denominators.
 * `captureSeedRosterUpkeepPin` is called unconditionally by the seeder.
 */
export interface SeedRosterUpkeepPin {
  /** The preset this was captured for. A pin never applies to a different one. */
  preset: string;
  /** countryId to the resolved denominator, including the nearest-preset fallback. */
  byCountry: Record<string, number>;
  capturedAt?: Date;
  /** Free text, for a pin written by a heal rather than by the seeder. */
  note?: string;
}

/**
 * Build the pin for a preset from the CURRENT code.
 *
 * Stores the RESOLVED value, the one `seedRosterUpkeepFor` actually returns, not the
 * raw per-preset table. The difference is not cosmetic: DE, DD, AT and NG seed nothing
 * in 1953 because their armed forces are founded later, and resolve through the
 * nearest-preset search instead. Pinning the raw table would drop all four and hand
 * them a free army, which is the exact bug that search was added to fix.
 */
export function captureSeedRosterUpkeepPin(preset: string): SeedRosterUpkeepPin {
  const byCountry: Record<string, number> = {};
  for (const countryId of Object.keys(COUNTRY_CONFIGS) as CountryId[]) {
    const value = seedRosterUpkeepFor(preset, countryId);
    if (value > 0) byCountry[countryId] = value;
  }
  return { preset, byCountry, capturedAt: new Date() };
}

/**
 * Per-process cache. The pin changes once per world, at seed time, so re-reading it for
 * every country on every turn would be a query per country per turn for a value that
 * does not move. A short TTL rather than forever so a heal that writes it lands without
 * a restart.
 */
const CACHE_TTL_MS = 60_000;
let cache: { at: number; pin: SeedRosterUpkeepPin | null } | null = null;

/** Drop the cache. For tests, and for a caller that has just written a new pin. */
export function clearSeedRosterUpkeepPinCache(): void {
  cache = null;
}

async function loadPin(db: Db): Promise<SeedRosterUpkeepPin | null> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.pin;
  const doc = await gameConfigCollection(db)
    .findOne({ _id: "default" }, { projection: { seedRosterUpkeep: 1 } })
    .catch(() => null);
  const pin = (doc as { seedRosterUpkeep?: SeedRosterUpkeepPin } | null)?.seedRosterUpkeep ?? null;
  cache = { at: now, pin };
  return pin;
}

/** Pure: the pinned value when this pin covers this preset and country, else null. */
export function pinnedUpkeep(
  pin: SeedRosterUpkeepPin | null | undefined,
  preset: string,
  countryId: string
): number | null {
  if (!pin || pin.preset !== preset) return null;
  const value = pin.byCountry?.[countryId];
  // A zero or a malformed entry means "no usable pin", never "this army is free":
  // `upkeepPerTurn` divides by this, and a zero denominator is the free-army bug.
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * The denominator to charge this country's upkeep against: the world's own pin when it
 * has one, the derived value otherwise.
 *
 * Every caller of `seedRosterUpkeepFor` that touches a LIVE world should use this. The
 * bare derived function remains correct for seeding, calibration and tests, which ask
 * what the current code produces rather than what this world started with.
 */
export async function resolveSeedRosterUpkeep(
  db: Db,
  preset: string,
  countryId: string
): Promise<number> {
  const pin = await loadPin(db);
  return pinnedUpkeep(pin, preset, countryId) ?? seedRosterUpkeepFor(preset, countryId);
}
