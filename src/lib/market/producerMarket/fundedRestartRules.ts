/**
 * Funded restart (funded-market cutover). An AI owner mothballs a plant after
 * two turns without sales, and the only way back is the glut restart, which
 * reads the legacy price ratio. Under the funded market that ratio does not
 * see the shortage the funded book measures, so a plant mothballed early
 * stays cold while buyers in its lane are asking for twice what is delivered.
 *
 * Here the funded market publishes, per sector type and strategy, the
 * shortage its running plants of that recipe face (units asked over delivered
 * on their main product, weighted by what they delivered). An AI owner then
 * reopens one mothballed plant a turn whose recipe reads at least
 * FUNDED_RESTART_PRESSURE. A reopened plant starts from its probe run and must
 * sell to stay open, so a wrong reading costs a turn, not a glut.
 *
 * Pure: plant readings in, pressure per recipe out; sectors in, the one to reopen out.
 */
export const FUNDED_RESTART_PRESSURE = 1.5;

export function recipeKey(sectorType: string, strategyId: string | null | undefined): string {
  return `${sectorType}|${strategyId ?? "standard"}`;
}

function positive(x: number | undefined): number {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;
}

/** Delivered-weighted shortage per recipe across running plants with a reading. */
export function recipePressure(
  plants: readonly {
    sectorType: string;
    strategyId?: string | null;
    pressure?: number;
    deliveredUnits: number;
  }[]
): Record<string, number> {
  const weight = new Map<string, number>();
  const sum = new Map<string, number>();
  for (const p of plants) {
    const w = positive(p.deliveredUnits);
    const v = positive(p.pressure);
    if (!(w > 0) || !(v > 0)) continue;
    const k = recipeKey(p.sectorType, p.strategyId);
    weight.set(k, (weight.get(k) ?? 0) + w);
    sum.set(k, (sum.get(k) ?? 0) + w * v);
  }
  const out: Record<string, number> = {};
  for (const k of [...weight.keys()].sort()) out[k] = sum.get(k)! / weight.get(k)!;
  return out;
}

/**
 * The mothballed sector to reopen this turn: the one whose recipe reads the
 * deepest shortage at or above the threshold. Excluded ids (divested this turn)
 * and sectors the caller marks ineligible are skipped.
 */
export function chooseFundedRestart<
  S extends {
    _id: { toString(): string };
    sectorType: string;
    strategyId?: string | null;
    mothballed?: boolean;
  },
>(
  sectors: readonly S[],
  pressureOf: (sectorType: string, strategyId: string | null | undefined) => number | undefined,
  eligible: (sector: S) => boolean = () => true
): S | null {
  let best: { sector: S; pressure: number } | null = null;
  for (const s of sectors) {
    if (s.mothballed !== true || !eligible(s)) continue;
    const p = positive(pressureOf(s.sectorType, s.strategyId));
    if (p < FUNDED_RESTART_PRESSURE) continue;
    if (
      !best ||
      p > best.pressure ||
      (p === best.pressure && s._id.toString() < best.sector._id.toString())
    )
      best = { sector: s, pressure: p };
  }
  return best?.sector ?? null;
}
