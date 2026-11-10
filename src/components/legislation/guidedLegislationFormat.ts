/** Display helpers for the guided legislation modal. */
import type { CountryId } from "@/lib/constants/countriesCore";
import type { ResetMetricScoreCountry } from "@/lib/resetMetrics/conditionScore";

export function money(value: number): string {
  const sign = value < 0 ? "-" : value > 0 ? "+" : "";
  const absolute = Math.abs(value);
  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
  return `${sign}${compact.format(absolute)}/yr`;
}

export function changeClass(value: number, lowerIsGood: boolean): string {
  if (Math.abs(value) < 0.0001) return "text-muted";
  const good = lowerIsGood ? value < 0 : value > 0;
  return good ? "text-success" : "text-error";
}

export function resetMetricCountry(countryId: CountryId): ResetMetricScoreCountry | null {
  const normalized = countryId.toUpperCase();
  return normalized === "US" || normalized === "UK" || normalized === "JP" ? normalized : null;
}

export function observedDirection(delta: number): string {
  if (Math.abs(delta) < 0.000001) return "At equilibrium";
  return delta > 0 ? "▲" : "▼";
}

export function metricDirectionClass(indicator: string): string {
  return indicator === "▲" || indicator === "▼" ? "inline-block text-sm leading-none" : "";
}
