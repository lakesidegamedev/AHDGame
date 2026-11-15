import { formatCurrencyCompactChip } from "@/lib/utils/formattersCore";
import { costLines } from "@/lib/crises/v2/ledgerView";
import type { LeverCost } from "@/lib/crises/v2/types";

export const SPARKLINE_WIDTH = 96;
export const SPARKLINE_HEIGHT = 24;

/** SVG polyline points for values on the 0..100 severity scale. */
export function sparklinePoints(
  values: readonly number[],
  startIndex = 0,
  totalPoints = values.length,
  width = SPARKLINE_WIDTH,
  height = SPARKLINE_HEIGHT
): string {
  if (values.length === 0) return "";
  const span = Math.max(1, totalPoints - 1);
  return values
    .map((value, i) => {
      const x = ((startIndex + i) / span) * width;
      const y = height - (Math.min(100, Math.max(0, value)) / 100) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function leverCostLines(cost: LeverCost): string[] {
  return costLines(cost, (amount) => formatCurrencyCompactChip(amount));
}

export function leverCooldownText(cooldownTurns: number): string {
  if (cooldownTurns <= 0) return "Can be used every turn";
  return `Then waits ${cooldownTurns} ${cooldownTurns === 1 ? "turn" : "turns"} before reuse`;
}

export function forecastText(severity: number, forecast: readonly number[]): string | null {
  if (forecast.length === 0) return null;
  const end = forecast[forecast.length - 1];
  const turns = forecast.length;
  const now = Math.round(severity);
  const later = Math.round(end);
  if (Math.abs(later - now) < 1) return `If nobody acts: holds near ${now} for ${turns} turns.`;
  return `If nobody acts: ${now} now, about ${later} in ${turns} turns.`;
}
