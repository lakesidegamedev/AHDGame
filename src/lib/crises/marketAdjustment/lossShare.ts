/**
 * Loss share: how much of a country's productive capacity sits in plants that
 * lost money in the funded market this turn. This is the measured signal behind
 * the Market Adjustment event. GDP growth tracks revenue and output, not profit,
 * so a shakeout where plants keep selling at a loss never moves it; the loss
 * share does.
 *
 * Weighted by installed capacity rather than plant count, so a few large
 * loss-making plants outweigh many small profitable ones, and idle capacity that
 * earns nothing counts as the overcapacity it is. Pure: plain data in, out.
 */

export interface LossShareSector {
  countryId: string | null | undefined;
  /** Installed capacity in physical units. */
  capitalStock: number | null | undefined;
  /** Turn of the sector's last funded settlement. */
  settledTurn: number | null | undefined;
  /** Receipt profit that turn (revenue minus inputs, wages and site bills). */
  profit: number | null | undefined;
}

/**
 * countryId -> share (0 to 1) of settled capacity whose receipt profit was
 * negative on `turn`. Sectors not settled this turn, with no capacity, or with
 * no readable profit are left out of both sides. Countries with no settled
 * capacity are absent.
 */
export function lossShareByCountry(
  sectors: readonly LossShareSector[],
  turn: number
): Map<string, number> {
  const total = new Map<string, number>();
  const losing = new Map<string, number>();
  for (const s of sectors) {
    if (!s.countryId || s.settledTurn !== turn) continue;
    if (typeof s.profit !== "number" || !Number.isFinite(s.profit)) continue;
    const capacity = typeof s.capitalStock === "number" && s.capitalStock > 0 ? s.capitalStock : 0;
    if (capacity <= 0) continue;
    total.set(s.countryId, (total.get(s.countryId) ?? 0) + capacity);
    if (s.profit < 0) losing.set(s.countryId, (losing.get(s.countryId) ?? 0) + capacity);
  }
  const out = new Map<string, number>();
  for (const [countryId, all] of total) out.set(countryId, (losing.get(countryId) ?? 0) / all);
  return out;
}
