/**
 * The slow market price a pricing posture is measured from. It follows the
 * clearing but moves at most POSTURE_ANCHOR_MAX_MOVE a turn, so a discount
 * that sets the clearing cannot discount its own price again next turn.
 * A lane that did not trade keeps its anchor.
 */

export const POSTURE_ANCHOR_MAX_MOVE = 0.06;
/** Recent turns whose clearing seeds the first anchors. */
export const POSTURE_ANCHOR_SEED_TURNS = 5;

function positive(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** One lane: follow the clearing within the per-turn move cap. */
export function nextPostureAnchor(prior: number | undefined, clearing: number | undefined) {
  if (!positive(clearing)) return positive(prior) ? prior : undefined;
  if (!positive(prior)) return clearing;
  const lo = prior * (1 - POSTURE_ANCHOR_MAX_MOVE);
  const hi = prior * (1 + POSTURE_ANCHOR_MAX_MOVE);
  return Math.min(hi, Math.max(lo, clearing));
}

/** Every lane that has an anchor or traded this turn. */
export function nextPostureAnchors(
  prior: Readonly<Record<string, number>> | undefined,
  clearing: Readonly<Record<string, number>>
): Record<string, number> {
  const lanes = new Set([...Object.keys(prior ?? {}), ...Object.keys(clearing)]);
  const next: Record<string, number> = {};
  for (const lane of [...lanes].sort()) {
    const value = nextPostureAnchor(prior?.[lane], clearing[lane]);
    if (value != null) next[lane] = value;
  }
  return next;
}

/**
 * Starting anchors when none are stored yet: the median clearing of each lane
 * over the recent turns given, so the first anchor does not lock in a price
 * that a single undercutting turn has already crushed.
 */
export function seedPostureAnchors(
  history: readonly (Readonly<Record<string, number>> | undefined)[]
): Record<string, number> {
  const byLane = new Map<string, number[]>();
  for (const turn of history)
    for (const [lane, price] of Object.entries(turn ?? {}))
      if (positive(price)) byLane.set(lane, [...(byLane.get(lane) ?? []), price]);
  const seeded: Record<string, number> = {};
  for (const lane of [...byLane.keys()].sort()) {
    const prices = byLane.get(lane)!.sort((a, b) => a - b);
    const mid = Math.floor(prices.length / 2);
    seeded[lane] = prices.length % 2 === 1 ? prices[mid] : (prices[mid - 1] + prices[mid]) / 2;
  }
  return seeded;
}
