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
 * A recipe with every plant mothballed has no running plant to publish a
 * reading, so it reads its own output lanes in the funded book instead; without
 * that a fully cold recipe could never reopen however short its buyers were.
 *
 * Pure: plant readings in, pressure per recipe out; sectors in, the one to reopen out.
 */
import { laneKeyOf } from "./laneKey";

export const FUNDED_RESTART_PRESSURE = 1.5;

export function recipeKey(sectorType: string, strategyId: string | null | undefined): string {
  return `${sectorType}|${strategyId ?? "standard"}`;
}

function positive(x: number | undefined): number {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;
}

export interface PressurePlant {
  sectorType: string;
  strategyId?: string | null;
  pressure?: number;
  deliveredUnits: number;
}

/**
 * A mothballed plant's own output lanes, from its last settled turn. It
 * delivered nothing, so it carries no reading of its own; these lanes are what
 * its recipe sells into.
 */
export interface MothballedRecipePlant {
  sectorType: string;
  strategyId?: string | null;
  products?: readonly { commodity: string; book: string }[];
}

/** Delivered-weighted shortage per recipe across running plants with a reading. */
export function recipePressure(plants: readonly PressurePlant[]): Record<string, number> {
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
 * Pressure per recipe including recipes whose plants are all mothballed.
 *
 * Only a running plant publishes the shortage it reads, so a recipe with every
 * plant mothballed publishes nothing and could never reopen however short its
 * buyers were. For a recipe with no running plant the funded book is read
 * instead: the deepest of its mothballed plants' output lanes stands in for the
 * missing reading. Any lane where buyers asked for more than was delivered is
 * unmet demand, so the recipe reads at least the restart threshold; its
 * recorded pressure orders it against the recipes that are still running.
 */
export function fundedRecipePressure(input: {
  running: readonly PressurePlant[];
  mothballed: readonly MothballedRecipePlant[];
  pressureByBook: ReadonlyMap<string, number> | undefined;
}): Record<string, number> {
  const out = recipePressure(input.running);
  const runningRecipes = new Set(Object.keys(out));
  for (const plant of input.mothballed) {
    const key = recipeKey(plant.sectorType, plant.strategyId);
    if (runningRecipes.has(key)) continue;
    let deepest = out[key] ?? 0;
    for (const product of plant.products ?? []) {
      const lane = laneKeyOf(product.commodity, product.book);
      deepest = Math.max(deepest, positive(input.pressureByBook?.get(lane)));
    }
    // A reading of 1 is asked equal to delivered: the lane was served.
    if (deepest > 1) out[key] = Math.max(FUNDED_RESTART_PRESSURE, deepest);
  }
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
