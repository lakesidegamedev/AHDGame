import { politicalScoreFromLegacyValue } from "@/lib/politicalMetrics/derive/legacyInversion";
import { propertyCrimeBand } from "./propertyCrimeBand";

/** The score property crime had before its era scale: the flat total-crime thresholds. */
function legacyScore(value: number, countryId: string, year: number): number | null {
  return politicalScoreFromLegacyValue("publicSafety", "crimeRate", value, countryId, year);
}

/**
 * Re-express property crime movement on the era scale. Movement since the
 * opening is kept as condition points, so a region that worsened by 14 points
 * on the old scale is 14 points worse on the new one, instead of carrying the
 * rate swing the old scale's flat slope produced.
 */
export function propertyCrimeOnEraScale(
  openingValue: number,
  currentValue: number,
  countryId: string,
  year: number
): number | null {
  const band = propertyCrimeBand(countryId, year);
  if (!band || !Number.isFinite(openingValue) || !Number.isFinite(currentValue)) return null;
  const before = legacyScore(openingValue, countryId, year);
  const now = legacyScore(currentValue, countryId, year);
  if (before === null || now === null) return null;
  const span = band.worst - band.best;
  const openingScore = ((band.worst - openingValue) / span) * 100;
  const score = Math.max(0, Math.min(100, openingScore + (now - before)));
  return Number(Math.max(0, band.worst - (score / 100) * span).toFixed(6));
}
