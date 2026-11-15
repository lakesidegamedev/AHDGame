/**
 * Starting size of command-economy state enterprises. It sizes an opening
 * enterprise from regional GDP and limits nothing after seeding.
 */
import { getCountryConfig, type CountryId } from "@/lib/constants/countries";
import type { OperatingSectorType } from "@/lib/constants/corporations";
import { getMinStateEnterpriseRevenue, getSectorSeedScale } from "@/lib/constants/sectorSeedEra";
import { getStateSectorWeights } from "@/lib/seeds/reference/sectorSeedWeights";

/**
 * Per-country, per-sector multiplier for downstream (input-consuming) state
 * enterprises: additive capacity on top of the normalised sector-weight share.
 *
 * East German steel cannot be sold to the West under the trade embargo and
 * private founding is banned in a command economy, so no player can build the
 * missing consumers. Construction is the real downstream steel sink and is
 * multiplied to absorb the lignite-fed steel glut. Vehicles stay small because
 * their output has no export market.
 */
export const COUNTRY_SECTOR_SEED_MULTIPLIER: Partial<
  Record<CountryId, Partial<Record<OperatingSectorType, number>>>
> = {
  DD: {
    construction: 8,
  },
};

/** The downstream seed multiplier for one (country, operating lane); 1 when unset. */
export function countrySectorSeedMultiplier(countryId: CountryId, sectorType: string): number {
  const value = COUNTRY_SECTOR_SEED_MULTIPLIER[countryId]?.[sectorType as OperatingSectorType];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 1;
}

/**
 * Starting size (₳/day) of one state enterprise in a (state, lane). `gdp` is
 * state GDP in local-currency millions; `usdExchangeRate` normalizes it to ₳.
 * Scale and floor are resolved per preset (see `constants/sectorSeedEra.ts`).
 */
export function computeStateEnterpriseSeedRevenue(params: {
  gdp: number;
  countryId: CountryId;
  stateId: string;
  sectorType: string;
  preset: string;
  boostMultiplier?: number;
}): number {
  const { gdp, countryId, stateId, sectorType, preset, boostMultiplier = 1 } = params;
  const { usdExchangeRate } = getCountryConfig(countryId, preset);
  const weights = getStateSectorWeights(stateId, countryId, preset);
  const base = Math.round(
    gdp *
      usdExchangeRate *
      getSectorSeedScale(preset) *
      (weights[sectorType as OperatingSectorType] ?? 0)
  );
  const downstreamMultiplier = countrySectorSeedMultiplier(countryId, sectorType);
  return Math.round(
    Math.max(getMinStateEnterpriseRevenue(preset), base) * downstreamMultiplier * boostMultiplier
  );
}
