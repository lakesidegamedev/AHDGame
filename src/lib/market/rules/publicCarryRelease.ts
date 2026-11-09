/**
 * Staged release of carried public budget (#5454, stage
 * `producerPublicCarryReleaseStage`). See publicCarryRules for the carry itself.
 *
 * Pure: lines and carry in, released lines and held carry out.
 */
import {
  PUBLIC_CARRY_MAX_TURNS,
  carryLineKey,
  type LineCarry,
} from "@/lib/market/producerMarket/publicCarryRules";

function positive(x: number | undefined): number {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;
}

/**
 * Most a line may draw from its carry in one turn, as a share of its fresh
 * outlay (issue #5448, stage `producerPublicCarryReleaseStage`). Without it a
 * line that sat short for four turns spent five turns of budget the moment
 * supply landed, then fell back: a seller saw revenue jump several times over
 * for one turn. Held carry stays in the wallet and is drawn on later turns.
 */
export const PUBLIC_CARRY_RELEASE_SHARE = 0.5;

/**
 * Like withCarriedLines, but each line takes at most `releaseShare` of its
 * fresh outlay from the carry this turn. The rest comes back as `held`, to be
 * kept for next turn alongside what this turn leaves unspent.
 */
export function releaseCarriedLines<
  T extends { commodity: string; book: string; amountLocal: number },
>(
  lines: readonly T[],
  carry: LineCarry | undefined,
  releaseShare: number = PUBLIC_CARRY_RELEASE_SHARE
): { lines: T[]; held: LineCarry } {
  // Never more than the whole fresh outlay a turn, whatever a caller passes.
  const share = Number.isFinite(releaseShare) && releaseShare > 0 ? Math.min(1, releaseShare) : 0;
  const held: LineCarry = {};
  const out = lines.map((l) => {
    const key = carryLineKey(l.commodity, l.book);
    const extra = positive(carry?.[key]);
    if (!(extra > 0)) return { ...l };
    const released = Math.min(extra, share * positive(l.amountLocal));
    if (extra - released > 0) held[key] = extra - released;
    return released > 0 ? { ...l, amountLocal: l.amountLocal + released } : { ...l };
  });
  return { lines: out, held };
}

/**
 * Next turn's carry with this turn's held-back carry added in, each line still
 * capped at PUBLIC_CARRY_MAX_TURNS of its fresh outlay.
 */
export function withHeldCarry(
  next: LineCarry,
  held: LineCarry | undefined,
  freshByKey: ReadonlyMap<string, number>
): LineCarry {
  if (!held || Object.keys(held).length === 0) return { ...next };
  const out: LineCarry = { ...next };
  for (const [key, amount] of Object.entries(held)) {
    const total = positive(out[key]) + positive(amount);
    // A line missing from freshByKey no longer exists, so its cap is 0 and its
    // held carry is dropped, as withCarriedLines drops carry for a vanished line.
    const cap = PUBLIC_CARRY_MAX_TURNS * positive(freshByKey.get(key));
    const kept = Math.min(total, cap);
    if (kept > 0) out[key] = kept;
  }
  return out;
}
