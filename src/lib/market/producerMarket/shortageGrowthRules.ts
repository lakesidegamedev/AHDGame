/**
 * Shortage growth (funded-market cutover). Under the demand plan a line that
 * sells out at a profit grows a fixed step a turn, while a glut drops it to the
 * probe run at once. A line knocked to the floor by one bad turn therefore
 * needs a couple of dozen turns to climb back even when funded buyers ask for
 * many times what the market supplies, and the wages that run would pay never
 * reach households.
 *
 * Here the step follows the measured shortage of the line's own book: units
 * funded buyers asked for over units delivered, from last turn's settled
 * orders. A sold-out line grows by that ratio, at least the normal step and at
 * most SHORTAGE_GROWTH_CAP a turn, so a deep shortage refills capacity in a
 * few turns without one turn's reading overshooting into a glut.
 *
 * Pure: settled order outcomes in, pressure per book out; pressure in, growth out.
 */
import { OUTPUT_GROW_STEP } from "./outputResponseRules";

export const SHORTAGE_GROWTH_CAP = 2;

function bookKey(commodity: string, book: string): string {
  return `${commodity}|${book}`;
}

function positive(x: number | undefined): number {
  return typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0;
}

/**
 * Asked over delivered units per commodity book. A book where buyers asked and
 * nothing was delivered reads at the cap; a book nobody asked on is absent.
 */
export function bookPressure(
  outcomes: readonly {
    commodity: string;
    book: string;
    requestedUnits: number;
    deliveredUnits: number;
  }[]
): Record<string, number> {
  const asked = new Map<string, number>();
  const got = new Map<string, number>();
  for (const o of outcomes) {
    const k = bookKey(o.commodity, o.book);
    asked.set(k, (asked.get(k) ?? 0) + positive(o.requestedUnits));
    got.set(k, (got.get(k) ?? 0) + positive(o.deliveredUnits));
  }
  const out: Record<string, number> = {};
  for (const [k, a] of [...asked].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))) {
    if (!(a > 0)) continue;
    const g = got.get(k) ?? 0;
    out[k] = g > 0 ? Math.min(SHORTAGE_GROWTH_CAP, a / g) : SHORTAGE_GROWTH_CAP;
  }
  return out;
}

/** Growth factor for a sold-out line: the book's pressure, between the normal step and the cap. */
export function shortageGrowth(pressure: number | undefined): number {
  const step = 1 + OUTPUT_GROW_STEP;
  return Math.min(SHORTAGE_GROWTH_CAP, Math.max(step, positive(pressure)));
}

/**
 * The pressure a plant reads: that of the product it delivered most of last
 * turn, so a multi-product plant follows its main line.
 */
export function plantPressure(
  products:
    | readonly { commodity: string; book: string; deliveredUnits?: number; soldUnits?: number }[]
    | undefined,
  pressureByBook: ReadonlyMap<string, number> | undefined
): number | undefined {
  if (!products || products.length === 0 || !pressureByBook) return undefined;
  let best: { key: string; units: number } | null = null;
  for (const p of products) {
    const units = positive(p.deliveredUnits ?? p.soldUnits);
    const key = bookKey(p.commodity, p.book);
    if (!best || units > best.units || (units === best.units && key < best.key))
      best = { key, units };
  }
  return best ? pressureByBook.get(best.key) : undefined;
}
