/**
 * Steady household income for the funded market (gameConfig.producerHouseholdIncomeFloor).
 *
 * Household transfers (pensions, welfare, benefits) are scaled by the plant
 * economy's share of GDP. That share is measured from funded value added, so it
 * shrinks with the plant economy and transfers collapse with it (45.9M a turn at
 * the opening to 0.6M after 24 turns on c21). Two rules end that feedback while
 * staying inside the government's own transfer lines:
 *
 * 1. Held share: a country's share never falls below the share it had at its
 *    first funded turn.
 * 2. Income floor: when planned household income (wages and operating payments
 *    the plants will pay, plus transfers) is under the floor, every country's
 *    share rises by the same increment of its full transfer line, capped at the
 *    whole line, until the floor is met. The part above the held share is the
 *    explicit top-up reported by the econ report.
 *
 * Pure: shares, full transfer lines and planned income in, shares and top-up out.
 */

export interface HouseholdSourceResult {
  shares: Map<string, number>;
  /** Anchor per turn paid above the held-share transfers to reach the floor. */
  topUpAnchor: number;
}

/** A country's share is at least the share it had at its first funded turn. */
export function heldShares(
  current: ReadonlyMap<string, number>,
  opening: ReadonlyMap<string, number> | undefined
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [country, share] of current) {
    const held = opening?.get(country);
    out.set(
      country,
      Math.max(Number.isFinite(share) ? share : 0, held != null && Number.isFinite(held) ? held : 0)
    );
  }
  for (const [country, held] of opening ?? [])
    if (!out.has(country) && Number.isFinite(held)) out.set(country, held);
  return out;
}

export function incomeFloorShares(input: {
  shares: ReadonlyMap<string, number>;
  /** Each country's full transfer line (budget transfer categories per turn, anchor), at share 1. */
  lineAnchorByCountry: ReadonlyMap<string, number>;
  /** Wages plus operating payments the plants plan to pay households this turn, anchor. */
  plannedIncomeAnchor: number;
  /** Target household income per turn, anchor. 0 or less = off. */
  floorAnchor: number;
}): HouseholdSourceResult {
  const shares = new Map(input.shares);
  const lineTotal = [...input.lineAnchorByCountry.values()].reduce(
    (sum, v) => sum + (Number.isFinite(v) && v > 0 ? v : 0),
    0
  );
  if (!(input.floorAnchor > 0) || !(lineTotal > 0)) return { shares, topUpAnchor: 0 };
  let transfers = 0;
  for (const [country, line] of input.lineAnchorByCountry)
    if (line > 0) transfers += line * Math.min(1, Math.max(0, shares.get(country) ?? 0));
  const gap = input.floorAnchor - (Math.max(0, input.plannedIncomeAnchor) + transfers);
  if (!(gap > 0)) return { shares, topUpAnchor: 0 };
  const delta = gap / lineTotal;
  let topUp = 0;
  for (const [country, line] of input.lineAnchorByCountry) {
    if (!(line > 0)) continue;
    const before = Math.min(1, Math.max(0, shares.get(country) ?? 0));
    const after = Math.min(1, before + delta);
    shares.set(country, after);
    topUp += line * (after - before);
  }
  return { shares, topUpAnchor: topUp };
}
